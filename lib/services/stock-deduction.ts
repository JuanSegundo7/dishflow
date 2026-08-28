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
  // Cost/stock/finance porting, PR5 (Group 7b): raw order_items.customizations
  // JSON string. Only meaningful for kind="combo" lines — see
  // parseComboSlots below for the shape this is expected to (defensively)
  // contain. Optional/undefined for callers that don't have it at hand
  // (e.g. a non-combo line never needs it); treated the same as null.
  customizations?: string | null;
}

/**
 * Cost/stock/finance porting, PR4 scope note (Group 7a): combo-slot
 * deduction (parsing order_items.customizations to figure out which
 * supplies a combo's chosen sub-items consume) shipped in a SEPARATE later
 * slice — Group 7b, PR5 (see parseComboSlots + the "kind === combo" branch
 * below). `includeComboSlots` exists so 7a's call sites could exist before
 * 7b landed without changing this function's signature again; every actual
 * caller now passes `true` (see lib/hooks/supplies/use-order-stock-sync.ts).
 * Left as an opt-in flag (rather than always-on) so a caller that genuinely
 * cannot supply `customizations` on its DeductionPlanItems (none exist
 * today) still gets the safe "skip combo lines" 7a behavior instead of
 * silently under-deducting.
 */
export interface BuildStockDeductionPlanOptions {
  includeComboSlots?: boolean;
}

/**
 * Cost/stock/finance porting, PR5 (Group 7b). Defensive parse of a combo
 * order_item's `customizations` JSON string into the minimal shape this
 * module needs to resolve recipe lookups. Mirrors the same defensive style
 * services/order-data-loader.ts's `loadCombos` already uses for this exact
 * JSON (try/catch around JSON.parse, Array.isArray checks at every array
 * level, per-field fallbacks) — see that function for the "source of truth"
 * shape this is parsing:
 *   [{ slotId, slotType, burgers: [{ burgerId, quantity, extras: [{ id,
 *      quantity }] }], selectedExtras: [{ id }] }]
 *
 * Returns `null` for a genuine parse failure (missing/empty string,
 * JSON.parse throw, or the top-level value isn't an array) — the caller
 * treats `null` as "push to skipped, reason combo-unparsed". A malformed
 * individual burger/extra entry INSIDE an otherwise-valid array (e.g.
 * missing burgerId) is NOT a parse failure — that single entry is silently
 * dropped (contributes zero), matching how a product/addon line with no
 * configured recipe already contributes zero rather than being flagged.
 */
interface ParsedComboBurgerExtra {
  id: string;
  quantity: number;
}
interface ParsedComboBurger {
  burgerId: string;
  quantity: number;
  extras: ParsedComboBurgerExtra[];
}
interface ParsedComboSlot {
  burgers: ParsedComboBurger[];
  selectedExtras: { id: string }[];
}

function parseComboSlots(
  customizations: string | null | undefined,
): ParsedComboSlot[] | null {
  if (!customizations) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(customizations);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;

  try {
    return raw.map((slotData: any): ParsedComboSlot => {
      const burgersRaw = Array.isArray(slotData?.burgers) ? slotData.burgers : [];
      const burgers: ParsedComboBurger[] = burgersRaw
        .map((b: any): ParsedComboBurger | null => {
          const burgerId = typeof b?.burgerId === "string" ? b.burgerId : null;
          if (!burgerId) return null;

          const extrasRaw = Array.isArray(b?.extras) ? b.extras : [];
          const extras: ParsedComboBurgerExtra[] = extrasRaw
            .map((e: any): ParsedComboBurgerExtra | null => {
              const id = typeof e?.id === "string" ? e.id : null;
              if (!id) return null;
              return { id, quantity: Number(e?.quantity) || 0 };
            })
            .filter((e: ParsedComboBurgerExtra | null): e is ParsedComboBurgerExtra => e !== null);

          return { burgerId, quantity: Number(b?.quantity) || 0, extras };
        })
        .filter((b: ParsedComboBurger | null): b is ParsedComboBurger => b !== null);

      // Backward compat: old orders used `selectedExtra` (singular, a
      // single object) instead of `selectedExtras` (plural array) — same
      // fallback services/order-data-loader.ts's loadCombos already applies
      // for this exact JSON shape.
      const selectedExtrasRaw = Array.isArray(slotData?.selectedExtras)
        ? slotData.selectedExtras
        : slotData?.selectedExtra
          ? [slotData.selectedExtra]
          : [];
      const selectedExtras = selectedExtrasRaw
        .map((se: any) => (typeof se?.id === "string" ? { id: se.id as string } : null))
        .filter(
          (se: { id: string } | null): se is { id: string } => se !== null,
        );

      return { burgers, selectedExtras };
    });
  } catch {
    // Belt-and-suspenders: slotData shaped unexpectedly enough that even
    // the defensive per-field access above threw (e.g. slotData itself is
    // a primitive, not an object). Degrade to the same "unparsed" outcome
    // rather than let this escape as an unhandled exception.
    return null;
  }
}

/**
 * Cost/stock/finance porting, PR5 (Group 7b). Every product_id a combo
 * line's customizations JSON references (burger ids + each burger's nested
 * extra ids + the slot-level selectedExtras ids) — the I/O layer
 * (lib/hooks/supplies/use-order-stock-sync.ts) needs this to know which
 * recipes to fetch, since a combo line's own top-level `product_id` is
 * always null. Returns `[]` on parse failure (mirrors buildStockDeductionPlan's
 * own "unparsed → contributes nothing" handling — no recipes to fetch for a
 * line that will end up in `skipped` anyway).
 */
export function collectComboRecipeProductIds(
  customizations: string | null | undefined,
): string[] {
  const slots = parseComboSlots(customizations);
  if (!slots) return [];

  const ids: string[] = [];
  for (const slot of slots) {
    for (const burger of slot.burgers) {
      ids.push(burger.burgerId);
      for (const extra of burger.extras) ids.push(extra.id);
    }
    for (const se of slot.selectedExtras) ids.push(se.id);
  }
  return ids;
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
 *     "no-recipe") when `opts.includeComboSlots` is not `true`.
 *   - kind="combo" line, `opts.includeComboSlots === true` (PR5/Group 7b):
 *     `item.customizations` is parsed (see parseComboSlots above); each
 *     slot's burgers (recipe[burgerId], factor FIXED at 1.0 — see this
 *     file's PR5 header note on why variant scaling is out of scope here)
 *     and each burger's nested extras (recipe[extra.id] × extra.quantity)
 *     are summed, each already multiplied by that burger's own `quantity`;
 *     each slot's selectedExtras (recipe[selectedExtra.id] × 1) are added
 *     on top; the whole thing is further multiplied by the combo line's own
 *     `item.quantity` (deliberately — see design note: physical stock
 *     consumption must count every unit sold, unlike
 *     order-price-calculator.ts's slot-extras pricing, which does NOT
 *     multiply by the combo line's quantity — a pre-existing pricing quirk
 *     not replicated here). A `customizations` value that fails to parse
 *     (missing, malformed JSON, or not shaped as an array) is pushed to
 *     `skipped` with reason "combo-unparsed" instead — never thrown.
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
      // Modifiers on a combo line (if any) are intentionally NOT walked
      // here — order_item_modifiers is never populated for combo lines
      // (see order-data-transformer.ts's transformCombosToOrderItems,
      // which always writes `extras: []` for combos); a combo's sub-item
      // consumption lives entirely in `customizations`.
      if (!opts?.includeComboSlots) {
        skipped.push({ reason: "no-recipe", label: item.burger_name });
        continue;
      }

      const slots = parseComboSlots(item.customizations);
      if (slots === null) {
        skipped.push({ reason: "combo-unparsed", label: item.burger_name });
        continue;
      }

      for (const slot of slots) {
        for (const burger of slot.burgers) {
          const burgerRecipe = recipesByProductId[burger.burgerId] ?? [];
          addLines(burgerRecipe, undefined, burger.quantity * item.quantity);

          for (const extra of burger.extras) {
            const extraRecipe = recipesByProductId[extra.id] ?? [];
            addLines(
              extraRecipe,
              undefined,
              extra.quantity * burger.quantity * item.quantity,
            );
          }
        }

        for (const selectedExtra of slot.selectedExtras) {
          const selectedExtraRecipe = recipesByProductId[selectedExtra.id] ?? [];
          addLines(selectedExtraRecipe, undefined, item.quantity);
        }
      }

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
