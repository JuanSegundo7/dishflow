import type {
  DeductionPlan,
  OrderItemKind,
  ProductSupplyWithSupply,
  VariantSelectionEntry,
} from "@/lib/types";
import { resolveRecipeQuantities } from "@/lib/services/recipe-cost";

/**
 * Cost/stock/finance porting, PR4 (Group 7a — Automatic Stock Deduction).
 * Pure function only — no supabase/react imports, deliberately, mirroring
 * lib/services/recipe-cost.ts's own "pure functions only" convention so
 * this can be unit-tested/reused in isolation. lib/hooks/supplies/
 * use-order-stock-sync.ts is the I/O layer that fetches the inputs this
 * function needs and applies its output to the DB.
 */

/**
 * Minimal shape this module needs from an order_item (+ its modifiers) to
 * build a deduction plan — deliberately narrower than the full OrderItem /
 * OrderItemInput types so this same function works whether the caller has a
 * DB-shaped OrderItemWithExtras (lib/hooks/orders/use-orders.ts's
 * useOrderWithItems) or an in-flight OrderItemInput payload that hasn't
 * been inserted yet (lib/hooks/orders/use-update-order.ts's R2 guard, PR4
 * task 7a.8, needs to build a plan from the payload BEFORE the new
 * order_items rows exist).
 */
export interface DeductionPlanItem {
  kind: OrderItemKind;
  product_id: string | null;
  quantity: number;
  burger_name: string;
  variant_selections?: VariantSelectionEntry[] | null;
  extras: { product_id: string; quantity: number }[];
}

/**
 * Cost/stock/finance porting, PR4 scope note (Group 7a ONLY): combo-slot
 * deduction (parsing order_items.customizations to figure out which
 * supplies a combo's chosen sub-items consume) ships in a SEPARATE later
 * slice — Group 7b, PR5. `includeComboSlots` exists so that future PR can
 * opt in without changing this function's call sites; 7a NEVER passes
 * `true` — every combo line in this PR is deducted as ZERO and pushed into
 * `skipped` with reason "no-recipe". This is a legal "deducts zero"
 * intermediate state per the spec, not a bug.
 */
export interface BuildStockDeductionPlanOptions {
  includeComboSlots?: boolean;
}

/**
 * Builds the aggregated (by supply_id) stock deduction plan for an order.
 *
 * Resolution rules (see this PR's design doc for the full rationale):
 *   - kind="product" line: recipe[product_id] scaled by the line's frozen
 *     variant_selections[].quantity_factor (via resolveRecipeQuantities —
 *     missing/null factor resolves to 1, NEVER 0) × item.quantity.
 *   - kind="addon" line: recipe[product_id] (unscaled — addons carry no
 *     variant_selections) × item.quantity.
 *   - order_item_modifiers row (`item.extras`): recipe[modifier.product_id]
 *     × modifier.quantity, taken AS-IS — verified against
 *     lib/hooks/orders/use-create-order.ts's insert shape, modifier rows
 *     carry their own independently pre-computed `quantity`, never
 *     multiplied by the parent line's `quantity`.
 *   - kind="combo" line: deducted as ZERO, pushed to `skipped` (reason
 *     "no-recipe") when `opts.includeComboSlots` is not `true` (always the
 *     case in 7a).
 *
 * A product/addon/modifier line whose product has NO recipe configured at
 * all (`recipesByProductId[product_id]` is empty/undefined) simply
 * contributes zero lines — that is not a "skip" in the `skipped` sense,
 * which is reserved for combo lines per this PR's scope; a missing recipe
 * on a non-combo product is an existing, separate data-quality concern
 * lib/services/recipe-cost.ts's `incomplete` flag already surfaces
 * elsewhere (the /precios recipe editor), not something this function
 * re-flags.
 */
export function buildStockDeductionPlan(
  order: { items: DeductionPlanItem[] },
  recipesByProductId: Record<string, ProductSupplyWithSupply[]>,
  opts?: BuildStockDeductionPlanOptions,
): DeductionPlan {
  const aggregated = new Map<string, number>();
  const skipped: DeductionPlan["skipped"] = [];

  const addLines = (
    recipe: ProductSupplyWithSupply[],
    variantFactors: Record<string, number> | undefined,
    multiplier: number,
  ) => {
    const effectiveQuantities = resolveRecipeQuantities(recipe, variantFactors);
    recipe.forEach((line, index) => {
      const qty = effectiveQuantities[index] * multiplier;
      if (qty <= 0) return;
      aggregated.set(line.supply_id, (aggregated.get(line.supply_id) ?? 0) + qty);
    });
  };

  for (const item of order.items) {
    if (item.kind === "combo") {
      // 7a never passes includeComboSlots=true — combo-slot parsing is
      // 7b's job (a separate later PR). See this file's header note.
      if (!opts?.includeComboSlots) {
        skipped.push({ reason: "no-recipe", label: item.burger_name });
      }
      // Modifiers on a combo line (if any) are intentionally NOT walked
      // here either — a combo's sub-item consumption is exactly what 7b's
      // customizations parsing is responsible for resolving, not the flat
      // order_item_modifiers join this function otherwise reads.
      continue;
    }

    // kind === "product" | "addon"
    const recipe = item.product_id ? (recipesByProductId[item.product_id] ?? []) : [];

    const variantFactors: Record<string, number> | undefined =
      item.kind === "product" && item.variant_selections?.length
        ? item.variant_selections.reduce<Record<string, number>>((acc, sel) => {
            acc[sel.variant_group_id] = sel.quantity_factor ?? 1;
            return acc;
          }, {})
        : undefined;

    addLines(recipe, variantFactors, item.quantity);

    for (const modifier of item.extras) {
      const modifierRecipe = recipesByProductId[modifier.product_id] ?? [];
      // Modifiers carry their own quantity, taken as-is — never multiplied
      // by the parent line's item.quantity. See this function's doc
      // comment above.
      addLines(modifierRecipe, undefined, modifier.quantity);
    }
  }

  return {
    lines: Array.from(aggregated.entries()).map(([supply_id, quantity]) => ({
      supply_id,
      quantity,
    })),
    skipped,
  };
}
