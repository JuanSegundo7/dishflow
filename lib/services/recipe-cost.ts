import type { ProductSupplyWithSupply } from "@/lib/types";

/**
 * Cost/stock/finance porting, PR1. Pure functions only — no supabase/react
 * imports, deliberately, so this can be unit-tested in isolation and reused
 * from any consuming component via useMemo (see components/precios/
 * recipe-editor.tsx and app/(dashboard)/precios/page.tsx). This is also the
 * ONLY place cost/margin are computed — per the architectural invariant
 * documented in lib/hooks/supplies/use-product-supplies.ts, cost/margin are
 * NEVER their own cached query; they are always derived here, on demand,
 * from whatever `["supplies"]` / `["product-supplies-bulk", ...]` data is
 * currently in the react-query cache.
 */

export interface RecipeCostLine {
  supply_id: string;
  /** null when the supply row itself could not be found (e.g. bad join). */
  supplyName: string | null;
  quantity: number;
  /** quantity, scaled by variantFactors[scales_with_variant_group_id] when present. */
  effectiveQuantity: number;
  unitCost: number;
  lineCost: number;
  /** True when this recipe line's supply could not be resolved at all. */
  missing: boolean;
  /** True when the supply resolved but is no longer active. */
  inactive: boolean;
}

export interface ProductCostResult {
  total: number;
  lines: RecipeCostLine[];
  /**
   * True when at least one recipe line's supply is missing or inactive —
   * the UI must surface this rather than silently treating an
   * unresolvable/retired ingredient as a $0 contribution to cost (see
   * QA2.3 in this PR's task list). Missing/inactive lines are excluded
   * from `total` (their lineCost is 0), since there is no reliable cost to
   * add for them — `incomplete` is what signals "this total is not the
   * full picture," not a silently-wrong total.
   */
  incomplete: boolean;
}

/**
 * Computes a product's total ingredient cost from its recipe lines.
 *
 * `variantFactors` is an optional map of variant_group_id -> the scaling
 * factor to apply (the selected VariantOption's quantity_factor — see
 * scripts/042-product-supplies.sql) for recipe lines that opted into
 * `scales_with_variant_group_id`. When omitted, or when a line's
 * `scales_with_variant_group_id` has no entry in the map, that line's
 * quantity is used as-is (factor of 1) — this PR does not build the UI that
 * populates `variantFactors` (that's a later phase); the parameter exists
 * so this function's contract already supports it.
 */
export function computeProductCost(
  recipe: ProductSupplyWithSupply[],
  variantFactors?: Record<string, number>,
): ProductCostResult {
  let total = 0;
  let incomplete = false;

  const lines: RecipeCostLine[] = recipe.map((line) => {
    const supply = line.supply;
    const missing = !supply;
    const inactive = !missing && supply.is_active === false;

    if (missing || inactive) {
      incomplete = true;
    }

    const factor =
      line.scales_with_variant_group_id && variantFactors
        ? (variantFactors[line.scales_with_variant_group_id] ?? 1)
        : 1;

    const effectiveQuantity = line.quantity * factor;
    const unitCost = supply?.cost_per_unit ?? 0;
    // Unresolvable/inactive lines contribute 0 to the total rather than a
    // possibly-stale cost_per_unit — `incomplete` is what tells the caller
    // this total isn't trustworthy on its own, not a silent guess.
    const lineCost = missing || inactive ? 0 : effectiveQuantity * unitCost;

    total += lineCost;

    return {
      supply_id: line.supply_id,
      supplyName: supply?.name ?? null,
      quantity: line.quantity,
      effectiveQuantity,
      unitCost,
      lineCost,
      missing,
      inactive,
    };
  });

  return { total, lines, incomplete };
}

export interface MarginResult {
  profit: number;
  /** Null when basePrice is 0 — never divide by zero. */
  marginPct: number | null;
}

/** Computes profit and margin percentage for a product given its cost. */
export function computeMargin(basePrice: number, cost: number): MarginResult {
  const profit = basePrice - cost;
  const marginPct = basePrice === 0 ? null : (profit / basePrice) * 100;

  return { profit, marginPct };
}
