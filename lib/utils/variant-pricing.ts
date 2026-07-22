import type { VariantGroupWithOptions, VariantSelectionEntry } from "@/lib/types";

/**
 * Phase 3 — generic variant-selection pricing helpers.
 *
 * Replaces the burger wizard's old magic-string formula
 * (`(count - default_x_quantity) * someExtra.price`, looked up via
 * `extras.find(e => e.name === "Medallón" | "Papas fritas chicas")`) with a
 * generic lookup against a product's `variant_groups`/`variant_options`
 * (see scripts/010-generic-products.sql and lib/hooks/use-products.ts's
 * `useProductWithVariants`).
 *
 * The burger wizard's meat/fries UI is still a stepper that controls a
 * plain integer count (meatCount / friesQuantity), not a generic
 * "pick one option from a list" UI. This module bridges the two: Phase 1's
 * migration seeded each generated variant_option's `sort_order` equal to
 * the count it represents (see 010-generic-products.sql §2a/§2b — the `n`
 * loop variable feeds both the option's label-selection logic AND its
 * sort_order), so "the option for count N" is simply "the option whose
 * sort_order === N". This lets the existing stepper UI keep working
 * unchanged while sourcing its price purely from variant_options.price_delta.
 */

export const MEAT_VARIANT_GROUP_LABEL = "Medallones";
export const FRIES_VARIANT_GROUP_LABEL = "Papas";

export function findVariantGroupByLabel(
  groups: VariantGroupWithOptions[] | undefined,
  label: string,
): VariantGroupWithOptions | undefined {
  return groups?.find((g) => g.label === label);
}

interface VariantDeltaResult {
  priceDelta: number;
  entry: VariantSelectionEntry | null;
}

/**
 * Resolves the price_delta for `count` units against `group`.
 *
 * NOTE on selection type: `Medallones`/`Papas` are always `selection:
 * "single"` groups today (see 010-generic-products.sql). This function only
 * ever resolves ONE option — the one whose sort_order matches `count`. If a
 * `selection: "multi"` group is ever passed in here, this still only
 * considers a single position (effectively "as if only the first selected
 * option counts") — a real multi-select picking UI is NOT implemented by
 * this phase and is out of scope; flagging this rather than silently
 * building partial multi-select support.
 */
export function resolveVariantDelta(
  group: VariantGroupWithOptions | undefined,
  count: number,
): VariantDeltaResult {
  if (!group || !group.variant_options || group.variant_options.length === 0) {
    return { priceDelta: 0, entry: null };
  }

  const exact = group.variant_options.find((o) => o.sort_order === count);
  if (exact) {
    return {
      priceDelta: Number(exact.price_delta),
      entry: {
        variant_group_id: group.id,
        variant_group_label: group.label,
        variant_option_id: exact.id,
        variant_option_label: exact.label,
        price_delta: Number(exact.price_delta),
      },
    };
  }

  // `count` falls outside the pre-generated option range — there is no
  // ceiling enforced anywhere in the wizard UI (see 010-generic-products.sql's
  // own comments flagging this as a judgment call for a later phase).
  // Rather than fabricate a fake option, reconstruct the linear relationship
  // price_delta(n) = slope * n + intercept from any two real generated
  // points: every option for a group was seeded from the exact same line
  // (`(n - default_quantity) * unitPrice`), so any two points reproduce it
  // exactly and this always matches what the old formula would have
  // produced, in range or out of it.
  const sorted = [...group.variant_options].sort((a, b) => a.sort_order - b.sort_order);
  const [a, b] = sorted;

  let priceDelta: number;
  if (a && b && a.sort_order !== b.sort_order) {
    const slope = (Number(b.price_delta) - Number(a.price_delta)) / (b.sort_order - a.sort_order);
    const intercept = Number(a.price_delta) - slope * a.sort_order;
    priceDelta = slope * count + intercept;
  } else {
    // Degenerate case: a single generated option to anchor on. No slope
    // information exists, so just use its price_delta verbatim.
    priceDelta = Number(a.price_delta);
  }

  // The referenced option in the snapshot is clamped to the nearest real
  // row purely so `variant_option_id` still points at something real for
  // audit purposes — the stored `price_delta` above is the extrapolated
  // value, NOT that nearest option's own price_delta.
  const nearest = sorted.reduce((closest, o) =>
    Math.abs(o.sort_order - count) < Math.abs(closest.sort_order - count) ? o : closest,
  );

  return {
    priceDelta,
    entry: {
      variant_group_id: group.id,
      variant_group_label: group.label,
      variant_option_id: nearest.id,
      variant_option_label: nearest.label,
      price_delta: priceDelta,
    },
  };
}

export interface BurgerVariantPricing {
  variantSelections: VariantSelectionEntry[];
  meatPriceAdjustment: number;
  friesPriceAdjustment: number;
}

/**
 * Resolves both the "Medallones" and "Papas" price deltas for a burger's
 * current meatCount/friesQuantity, given that burger's variant groups (from
 * `useBurgerVariantGroups`/`useProductWithVariants`). Groups that don't
 * exist (e.g. no "Medallón" extra was ever seeded for this burger — see
 * 010-generic-products.sql §2a) simply contribute 0 and no snapshot entry,
 * mirroring today's `meatExtra`-undefined behavior.
 */
export function buildBurgerVariantSelections(
  groups: VariantGroupWithOptions[] | undefined,
  meatCount: number,
  friesQuantity: number,
): BurgerVariantPricing {
  const meatGroup = findVariantGroupByLabel(groups, MEAT_VARIANT_GROUP_LABEL);
  const friesGroup = findVariantGroupByLabel(groups, FRIES_VARIANT_GROUP_LABEL);

  const meatResult = resolveVariantDelta(meatGroup, meatCount);
  const friesResult = resolveVariantDelta(friesGroup, friesQuantity);

  const variantSelections: VariantSelectionEntry[] = [];
  if (meatResult.entry) variantSelections.push(meatResult.entry);
  if (friesResult.entry) variantSelections.push(friesResult.entry);

  return {
    variantSelections,
    meatPriceAdjustment: meatResult.priceDelta,
    friesPriceAdjustment: friesResult.priceDelta,
  };
}
