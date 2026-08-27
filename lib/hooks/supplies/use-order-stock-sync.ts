import type { QueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { DeductionPlan, OrderStatus, ProductSupplyWithSupply } from "@/lib/types";
import {
  buildStockDeductionPlan,
  collectComboRecipeProductIds,
  type DeductionPlanItem,
} from "@/lib/services/stock-deduction";

/**
 * Cost/stock/finance porting, PR4 (Group 7a — Automatic Stock Deduction).
 * I/O layer over lib/services/stock-deduction.ts's pure
 * `buildStockDeductionPlan` — fetches whatever DB data that function needs
 * and applies its output (or reverses a previous application) against
 * `supplies.stock_quantity` + the `order_stock_movements` ledger
 * (scripts/044-order-stock-movements.sql).
 *
 * `syncOrderStockForTransition` is the SINGLE shared entry point every
 * order-status-writing mutation in lib/hooks/orders/use-orders.ts calls
 * (useCompleteOrder, useUpdateOrderStatus, useCancelOrder,
 * useReactivateOrder) — deciding apply vs. reverse vs. no-op from the
 * (from, to) status pair alone, so that decision can never drift between
 * call sites. lib/hooks/orders/use-update-order.ts's R2 guard (PR4 task
 * 7a.8) calls the lower-level `applyStockDeduction`/`reverseStockDeduction`
 * directly instead, since an item-mutation edit isn't a status transition.
 *
 * WRITE ORDERING (non-negotiable — see this PR's design doc's "atomicity-
 * gap mitigation" note): every failure mode here is deliberately biased
 * toward UNDER-counting stock (i.e. stock ends up lower than the true
 * physical amount) rather than OVER-counting it (stock reads higher than
 * reality, which would hide a real shortage). Concretely:
 *   - Apply: decrement `supplies.stock_quantity` BEFORE inserting the
 *     ledger row. A crash between those two steps under-counts (stock was
 *     already decremented, ledger row is missing) rather than
 *     over-counting.
 *   - Reverse: delete the ledger row BEFORE incrementing
 *     `supplies.stock_quantity` back. A crash between those two steps
 *     under-restores (stock stays decremented, ledger row is already gone)
 *     rather than double-restoring.
 *
 * IDEMPOTENCY: driven by the `order_stock_movements` ledger, never by
 * `orders.status` alone (see this PR's spec). `applyStockDeduction` first
 * reads which supply_ids already have a ledger row for this order and
 * skips them entirely (no re-decrement) — this is what makes a genuine
 * retry (the previous call already fully committed) a hard no-op. The
 * table's UNIQUE(order_id, supply_id) constraint is a second-line guard
 * for the narrow concurrent-double-click race (two requests both pass the
 * "already applied?" check before either commits its INSERT) — in that
 * race, the SECOND request's decrement has already run by the time its
 * INSERT collides, so it is swallowed as a no-op rather than surfaced as
 * an error, at the cost of a possible extra decrement in that one narrow
 * window. This is the one place the "bias toward under-counting" note
 * above allows a real (not just crash-window) double-decrement — flagged
 * here explicitly rather than left implicit.
 *
 * `supplies.stock_quantity` itself is updated via a plain
 * fetch-current-then-write-new-value round trip (not a DB-side atomic
 * increment/decrement) — this matches every other stock-quantity writer in
 * this codebase (see lib/hooks/supplies/use-supplies-crud.ts's
 * useAdjustSupplyStock, also a full-value replace); no Postgres RPC/
 * function exists anywhere in this repo to do better, and introducing one
 * is out of scope for this PR.
 */

type SupabaseClient = ReturnType<typeof createClient>;

function collectProductIds(items: DeductionPlanItem[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (item.product_id) ids.push(item.product_id);
    for (const extra of item.extras) ids.push(extra.product_id);
    // Cost/stock/finance porting, PR5 (Group 7b): a combo line's own
    // product_id is always null and its extras are always [] (see
    // order-data-transformer.ts) — the ids it needs recipes for live
    // inside `customizations` instead. See stock-deduction.ts's
    // collectComboRecipeProductIds for the parsing this shares with
    // buildStockDeductionPlan itself.
    if (item.kind === "combo") {
      ids.push(...collectComboRecipeProductIds(item.customizations));
    }
  }
  return ids;
}

async function fetchRecipesByProductId(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<Record<string, ProductSupplyWithSupply[]>> {
  const dedupedIds = Array.from(new Set(productIds));
  if (dedupedIds.length === 0) return {};

  const { data, error } = await supabase
    .from("product_supplies")
    .select("*, supply:supplies(*)")
    .in("product_id", dedupedIds);

  if (error) throw error;

  const byProductId: Record<string, ProductSupplyWithSupply[]> = {};
  for (const line of (data ?? []) as unknown as ProductSupplyWithSupply[]) {
    if (!byProductId[line.product_id]) byProductId[line.product_id] = [];
    byProductId[line.product_id].push(line);
  }
  return byProductId;
}

/** Fetches an order's items (+ modifiers) already shaped for buildStockDeductionPlan. */
async function fetchOrderItemsForDeduction(
  supabase: SupabaseClient,
  orderId: string,
): Promise<DeductionPlanItem[]> {
  const { data, error } = await supabase
    .from("order_items")
    .select(
      "kind, product_id, quantity, burger_name, variant_selections, customizations, order_item_modifiers(product_id, quantity)",
    )
    .eq("order_id", orderId);

  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    kind: row.kind,
    product_id: row.product_id,
    quantity: row.quantity,
    burger_name: row.burger_name,
    variant_selections: row.variant_selections,
    // Cost/stock/finance porting, PR5 (Group 7b): needed to resolve
    // combo-slot recipe lookups — see stock-deduction.ts's parseComboSlots.
    customizations: row.customizations,
    extras: (row.order_item_modifiers ?? []).map((m: any) => ({
      product_id: m.product_id,
      quantity: m.quantity,
    })),
  }));
}

/**
 * Decrements `supplies.stock_quantity` and inserts `order_stock_movements`
 * rows for a deduction plan's lines. Never blocks/throws on insufficient
 * stock — negative stock is an allowed, meaningful state (see
 * scripts/041-supplies-and-stock.sql) surfaced only by /insumos, never
 * enforced here. See this file's header for the idempotency/write-ordering
 * contract.
 */
async function applyDeductionPlan(
  supabase: SupabaseClient,
  orderId: string,
  plan: DeductionPlan,
): Promise<void> {
  if (plan.lines.length === 0) return;

  const { data: existing, error: existingError } = await supabase
    .from("order_stock_movements")
    .select("supply_id")
    .eq("order_id", orderId);

  if (existingError) throw existingError;

  const alreadyApplied = new Set((existing ?? []).map((row: any) => row.supply_id as string));
  const newLines = plan.lines.filter((line) => !alreadyApplied.has(line.supply_id));

  // Hard no-op: every line already has a ledger row for this order — a
  // genuine retry of a previously-completed application. Zero additional
  // decrement, zero duplicate ledger rows, per this PR's spec.
  if (newLines.length === 0) return;

  for (const line of newLines) {
    const { data: supply, error: supplyError } = await supabase
      .from("supplies")
      .select("stock_quantity")
      .eq("id", line.supply_id)
      .single();

    if (supplyError) throw supplyError;

    const { error: updateError } = await supabase
      .from("supplies")
      .update({ stock_quantity: (supply?.stock_quantity ?? 0) - line.quantity })
      .eq("id", line.supply_id);

    if (updateError) throw updateError;
  }

  const { error: insertError } = await supabase.from("order_stock_movements").insert(
    newLines.map((line) => ({
      order_id: orderId,
      supply_id: line.supply_id,
      quantity: line.quantity,
    })),
  );

  if (insertError) {
    // 23505 = unique_violation on (order_id, supply_id) — a concurrent
    // request already committed this exact movement row (see this file's
    // header "IDEMPOTENCY" note for the narrow race this covers). Treat as
    // already-applied, do NOT surface as an error to the calling mutation.
    if (insertError.code === "23505") return;
    throw insertError;
  }
}

/**
 * Reads and deletes an order's `order_stock_movements` rows, restoring
 * `supplies.stock_quantity` for each. No-op when the order has no ledger
 * rows (never completed, or was already reversed).
 */
async function reverseDeduction(supabase: SupabaseClient, orderId: string): Promise<void> {
  const { data: movements, error: selectError } = await supabase
    .from("order_stock_movements")
    .select("supply_id, quantity")
    .eq("order_id", orderId);

  if (selectError) throw selectError;
  if (!movements || movements.length === 0) return;

  const { error: deleteError } = await supabase
    .from("order_stock_movements")
    .delete()
    .eq("order_id", orderId);

  if (deleteError) throw deleteError;

  for (const movement of movements as { supply_id: string; quantity: number }[]) {
    const { data: supply, error: supplyError } = await supabase
      .from("supplies")
      .select("stock_quantity")
      .eq("id", movement.supply_id)
      .single();

    if (supplyError) throw supplyError;

    const { error: updateError } = await supabase
      .from("supplies")
      .update({ stock_quantity: (supply?.stock_quantity ?? 0) + movement.quantity })
      .eq("id", movement.supply_id);

    if (updateError) throw updateError;
  }
}

/**
 * Builds a deduction plan for `items` (fetching whichever recipes it
 * needs) and applies it. Exported so lib/hooks/orders/use-update-order.ts's
 * R2 guard (PR4 task 7a.8) can reapply stock for a freshly-edited item set
 * without a DB round trip to re-read the just-inserted order_items back.
 */
export async function applyStockDeduction(
  supabase: SupabaseClient,
  orderId: string,
  items: DeductionPlanItem[],
): Promise<DeductionPlan> {
  const recipesByProductId = await fetchRecipesByProductId(supabase, collectProductIds(items));
  // Cost/stock/finance porting, PR5 (Group 7b): the ONLY call site of
  // buildStockDeductionPlan — combo-slot deduction is now on for every
  // caller (syncOrderStockForTransition's completion path and
  // use-update-order.ts's R2 guard alike), since both feed this same
  // function.
  const plan = buildStockDeductionPlan({ items }, recipesByProductId, {
    includeComboSlots: true,
  });
  await applyDeductionPlan(supabase, orderId, plan);
  return plan;
}

/** Thin re-export for callers that only need the reverse half (R2 guard). */
export async function reverseStockDeduction(
  supabase: SupabaseClient,
  orderId: string,
): Promise<void> {
  await reverseDeduction(supabase, orderId);
}

/**
 * THE shared helper every order-status-writing mutation calls. Decides
 * apply / reverse / no-op purely from the (from, to) status pair:
 *   - entering "completed" (to === "completed" && from !== "completed"):
 *     fetch the order's current items and apply a deduction plan.
 *   - leaving "completed" (from === "completed" && to !== "completed"):
 *     reverse whatever was previously applied.
 *   - anything else (both "completed", or neither "completed"): no-op.
 *
 * Returns the applied DeductionPlan (so a caller can, e.g., surface
 * `plan.skipped` — see app/(dashboard)/insumos/page.tsx for whether that
 * hookup was ultimately wired), or null when nothing was applied.
 */
export async function syncOrderStockForTransition({
  supabase,
  orderId,
  from,
  to,
}: {
  supabase: SupabaseClient;
  orderId: string;
  from: OrderStatus;
  to: OrderStatus;
}): Promise<DeductionPlan | null> {
  const enteringCompleted = to === "completed" && from !== "completed";
  const leavingCompleted = from === "completed" && to !== "completed";

  if (enteringCompleted) {
    const items = await fetchOrderItemsForDeduction(supabase, orderId);
    return applyStockDeduction(supabase, orderId, items);
  }

  if (leavingCompleted) {
    await reverseDeduction(supabase, orderId);
    return null;
  }

  return null;
}

/**
 * Invalidation companion, mirroring use-supplies-crud.ts's
 * invalidateSupplyQueries pattern — called from each of the 4 status
 * mutations' onSuccess (and the R2 guard) after a sync that may have
 * touched stock, so the /insumos list and any per-order movement reads
 * pick up the change.
 */
export function invalidateOrderStockQueries(queryClient: QueryClient, orderId: string): void {
  queryClient.invalidateQueries({ queryKey: ["supplies"] });
  queryClient.invalidateQueries({ queryKey: ["all-supplies"] });
  queryClient.invalidateQueries({ queryKey: ["order-stock-movements", orderId] });
  queryClient.invalidateQueries({ queryKey: ["combo-lines-not-counted"] });
}
