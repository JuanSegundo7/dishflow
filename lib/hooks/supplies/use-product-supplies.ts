"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ProductSupply, ProductSupplyWithSupply } from "@/lib/types";

/**
 * Cost/stock/finance porting, PR1 (scripts/042-product-supplies.sql).
 * Read/write hooks for `product_supplies` (recipe lines).
 *
 * Query keys:
 *   - ["product-supplies", productId]        — one product's recipe.
 *   - ["product-supplies-bulk", sortedIdsCsv] — many products' recipes at
 *     once, for list views (e.g. /precios showing every product's cost
 *     column without N sequential fetches). Mirrors the bulk-query pattern
 *     already established by useBurgerVariantGroups in
 *     lib/hooks/use-products.ts: a single query keyed by the deduped,
 *     sorted, comma-joined id list, both to avoid a variable-length list of
 *     hook calls (Rules of Hooks) and to make it a single round trip.
 *
 * ARCHITECTURAL INVARIANT (do not violate): there is NO ["product-cost",
 * ...] or ["margin", ...] query key defined anywhere in this file, and none
 * should ever be added. Cost/margin are always derived via useMemo in the
 * consuming component from this hook's data + lib/hooks/supplies/
 * use-supplies.ts's ["supplies"] data, via lib/services/recipe-cost.ts's
 * pure functions — never cached as their own query. See
 * lib/hooks/supplies/use-supplies.ts's doc comment for why (a cached
 * derived value can only go stale independently of its inputs).
 */

export function useProductSupplies(productId: string | null | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["product-supplies", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_supplies")
        .select("*, supply:supplies(*)")
        .eq("product_id", productId as string);

      if (error) throw error;
      return data as unknown as ProductSupplyWithSupply[];
    },
    enabled: !!productId,
  });
}

/**
 * Bulk variant — every recipe line for the given product ids, embedding
 * each line's supply. Returns a map of product_id -> that product's recipe
 * lines. Note the embedded `supplies` join is unfiltered by `is_active`
 * (unlike lib/hooks/supplies/use-supplies.ts's useSupplies()) — this is
 * deliberate: an inactive/retired supply must still be visible to
 * lib/services/recipe-cost.ts so it can flag `incomplete: true`, not
 * silently vanish from the recipe.
 */
export function useProductSuppliesBulk(productIds: string[] | undefined) {
  const supabase = createClient();
  const dedupedSortedIds = Array.from(new Set(productIds ?? [])).sort();
  const queryKeyId = dedupedSortedIds.join(",");

  return useQuery({
    queryKey: ["product-supplies-bulk", queryKeyId],
    queryFn: async () => {
      if (dedupedSortedIds.length === 0) {
        return {} as Record<string, ProductSupplyWithSupply[]>;
      }

      const { data, error } = await supabase
        .from("product_supplies")
        .select("*, supply:supplies(*)")
        .in("product_id", dedupedSortedIds);

      if (error) throw error;

      const byProductId: Record<string, ProductSupplyWithSupply[]> = {};
      for (const line of (data ?? []) as unknown as ProductSupplyWithSupply[]) {
        if (!byProductId[line.product_id]) byProductId[line.product_id] = [];
        byProductId[line.product_id].push(line);
      }

      return byProductId;
    },
    enabled: dedupedSortedIds.length > 0,
  });
}

function invalidateProductSupplyQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  productId: string,
) {
  queryClient.invalidateQueries({ queryKey: ["product-supplies", productId] });
  // Bulk queries are keyed by a variable id-list string, so we can't target
  // one exact key — invalidate every bulk query instead. Cheap: this table
  // is small (one row per product+supply), so refetching every mounted
  // bulk list is not a real cost concern here.
  queryClient.invalidateQueries({ queryKey: ["product-supplies-bulk"] });
}

export function useCreateProductSupply() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (line: Omit<ProductSupply, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("product_supplies")
        .insert(line)
        .select("*, supply:supplies(*)")
        .single();

      if (error) throw error;
      return data as unknown as ProductSupplyWithSupply;
    },
    onSuccess: (data) => {
      invalidateProductSupplyQueries(queryClient, data.product_id);
    },
    onError: (error: any) => {
      console.error("Error creating recipe line:", error);
      alert("Error al agregar insumo a la receta: " + error.message);
    },
  });
}

export function useUpdateProductSupply() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      productId,
      ...line
    }: Partial<ProductSupply> & { id: string; productId: string }) => {
      const { data, error } = await supabase
        .from("product_supplies")
        .update(line)
        .eq("id", id)
        .select("*, supply:supplies(*)")
        .single();

      if (error) throw error;
      return { line: data as unknown as ProductSupplyWithSupply, productId };
    },
    onSuccess: ({ productId }) => {
      invalidateProductSupplyQueries(queryClient, productId);
    },
    onError: (error: any) => {
      console.error("Error updating recipe line:", error);
      alert("Error al actualizar insumo de la receta: " + error.message);
    },
  });
}

export function useDeleteProductSupply() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string }) => {
      const { error } = await supabase.from("product_supplies").delete().eq("id", id);

      if (error) throw error;
      return { productId };
    },
    onSuccess: ({ productId }) => {
      invalidateProductSupplyQueries(queryClient, productId);
    },
    onError: (error: any) => {
      console.error("Error deleting recipe line:", error);
      alert("Error al eliminar insumo de la receta: " + error.message);
    },
  });
}
