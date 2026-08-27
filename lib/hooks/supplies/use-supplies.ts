"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Supply } from "@/lib/types";

/**
 * Cost/stock/finance porting, PR1 (scripts/041-supplies-and-stock.sql).
 * Read hooks for `supplies`. Query key convention matched from
 * lib/hooks/use-products.ts: flat, kebab-case string arrays (["supplies"],
 * ["all-supplies"], ["supply", id]).
 *
 * IMPORTANT (design invariant, see lib/hooks/supplies/use-product-supplies.ts
 * for the other half): there is deliberately NO ["product-cost", ...] or
 * ["margin", ...] query key anywhere in this feature. Cost/margin are always
 * derived via useMemo in the consuming component from this hook's data
 * (["supplies"]) plus use-product-supplies.ts's bulk query — never cached
 * as their own query. Caching a derived value here would let it go stale
 * independently of the two things it's derived from (e.g. editing a
 * supply's cost_per_unit would need to know to also invalidate a
 * "product-cost" key for every product using it, which is exactly the kind
 * of cache-invalidation bug this architecture avoids by construction).
 */

/** Active supplies only — what the recipe editor's supply picker shows. */
export function useSupplies() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["supplies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplies")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return data as Supply[];
    },
  });
}

/**
 * Every supply, active or not — what the /insumos admin list shows (mirrors
 * useProducts()'s unfiltered-by-availability convention in
 * lib/hooks/use-products.ts).
 */
export function useAllSupplies() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["all-supplies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplies")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      return data as Supply[];
    },
  });
}

/** One supply by id — disabled while supplyId is falsy. */
export function useSupply(supplyId: string | null | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["supply", supplyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplies")
        .select("*")
        .eq("id", supplyId as string)
        .single();

      if (error) throw error;
      return data as Supply;
    },
    enabled: !!supplyId,
  });
}
