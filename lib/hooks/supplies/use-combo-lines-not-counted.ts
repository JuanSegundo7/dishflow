"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { buildStockDeductionPlan, type DeductionPlanItem } from "@/lib/services/stock-deduction";

/**
 * Cost/stock/finance porting, PR4 task 7a.10, NARROWED in PR5 task 7b.3.
 *
 * PR4 (Group 7a) counted EVERY combo order_items line across completed
 * orders, since 7a always skipped combo-slot deduction unconditionally
 * (`includeComboSlots` was never passed `true`). Now that PR5 (Group 7b)
 * actually parses+deducts combo customizations in the common case, "every
 * combo line" is no longer the right count — it would over-report lines
 * that in fact deducted correctly. The only combo lines that STILL land in
 * `skipped` post-7b are ones whose `customizations` JSON fails to parse
 * (reason "combo-unparsed" — see lib/services/stock-deduction.ts's
 * parseComboSlots) — a genuine data-quality signal (e.g. a corrupted or
 * unexpectedly-shaped customizations string), not "feature not built yet".
 *
 * DELIBERATE SCOPE NOTE (unchanged from PR4): there is still no persisted
 * table of `skipped` plan entries (order_stock_movements only ever records
 * lines that WERE deducted) — plumbing one through just for this
 * informational note would be disproportionate. Instead this hook re-runs
 * the exact same pure `buildStockDeductionPlan` the real deduction path
 * uses (lib/hooks/supplies/use-order-stock-sync.ts), with an empty
 * `recipesByProductId` — recipe lookups resolving to nothing only ever
 * zero out deduction *lines* (not a skip, see that function's doc comment),
 * so the resulting `plan.skipped` here is driven purely by genuine parse
 * failures, giving an accurate count without adding any new schema or
 * duplicating the parsing logic PR5 already wrote once as the single
 * source of truth. See app/(dashboard)/insumos/page.tsx for where this is
 * surfaced.
 */
export function useComboLinesNotCounted() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["combo-lines-not-counted"],
    queryFn: async () => {
      // Capped + ordered by recency: this is an actionable "check these
      // recent orders" diagnostic, not a historical archive scan — an
      // unbounded fetch+client-side re-parse of every completed combo line
      // ever placed would grow slower on every /insumos load (and every
      // order status change, since invalidateOrderStockQueries invalidates
      // this key) as order history accumulates.
      const { data, error } = await supabase
        .from("order_items")
        .select("kind, product_id, quantity, burger_name, customizations, orders!inner(status)")
        .eq("kind", "combo")
        .eq("orders.status", "completed")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      const items: DeductionPlanItem[] = ((data ?? []) as any[]).map((row) => ({
        kind: row.kind,
        product_id: row.product_id,
        quantity: row.quantity,
        burger_name: row.burger_name,
        customizations: row.customizations,
        extras: [],
      }));

      const plan = buildStockDeductionPlan({ items }, {}, { includeComboSlots: true });
      return plan.skipped.filter((s) => s.reason === "combo-unparsed").length;
    },
  });
}
