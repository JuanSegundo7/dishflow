"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Supply } from "@/lib/types";

/**
 * Cost/stock/finance porting, PR1 (scripts/041-supplies-and-stock.sql).
 * Write hooks for `supplies`. Mirrors lib/hooks/use-products-crud.ts's
 * shape (mutationFn + onSuccess invalidation + onError alert), the closest
 * sibling admin-CRUD hook in this repo.
 */
function invalidateSupplyQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["supplies"] });
  queryClient.invalidateQueries({ queryKey: ["all-supplies"] });
  queryClient.invalidateQueries({ queryKey: ["supply"] });
  // A supply's fields (cost_per_unit, is_active) are embedded via join in
  // every product_supplies read (see use-product-supplies.ts) — without
  // this, a consumer reading that embedded `supply` directly (rather than
  // re-deriving it from ["supplies"] like precios/page.tsx does) keeps
  // showing stale is_active/cost_per_unit after an edit here.
  queryClient.invalidateQueries({ queryKey: ["product-supplies"] });
  queryClient.invalidateQueries({ queryKey: ["product-supplies-bulk"] });
}

export function useCreateSupply() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (supply: Omit<Supply, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("supplies")
        .insert(supply)
        .select()
        .single();

      if (error) throw error;
      return data as Supply;
    },
    onSuccess: () => {
      invalidateSupplyQueries(queryClient);
    },
    onError: (error: any) => {
      console.error("Error creating supply:", error);
      alert("Error al crear insumo: " + error.message);
    },
  });
}

export function useUpdateSupply() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...supply
    }: Partial<Supply> & { id: string }) => {
      const { data, error } = await supabase
        .from("supplies")
        .update(supply)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Supply;
    },
    onSuccess: () => {
      invalidateSupplyQueries(queryClient);
    },
    onError: (error: any) => {
      console.error("Error updating supply:", error);
      alert("Error al actualizar insumo: " + error.message);
    },
  });
}

export function useDeleteSupply() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("supplies").delete().eq("id", id);

      if (error) {
        // product_supplies.supply_id references supplies ON DELETE RESTRICT
        // (scripts/042-product-supplies.sql) — deleting a supply still used
        // by a recipe fails with this FK-violation code. Same per-noun
        // mapping pattern as use-products-crud.ts's useDeleteProduct.
        if (error.code === "23503") {
          throw new Error(
            "No se puede eliminar este insumo porque está siendo usado en una receta. Desactivalo en su lugar.",
          );
        }
        throw error;
      }
    },
    onSuccess: () => {
      invalidateSupplyQueries(queryClient);
    },
    onError: (error: any) => {
      console.error("Error deleting supply:", error);
      alert(error.message || "Error al eliminar insumo");
    },
  });
}

/** Toggle is_active without requiring the caller to pass every other field. */
export function useToggleSupplyActive() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from("supplies")
        .update({ is_active: isActive })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Supply;
    },
    onSuccess: () => {
      invalidateSupplyQueries(queryClient);
    },
    onError: (error: any) => {
      console.error("Error toggling supply active state:", error);
      alert("Error al cambiar el estado del insumo: " + error.message);
    },
  });
}

/**
 * Manual stock adjustment — sets stock_quantity to an explicit value (not a
 * relative delta; the form computes whatever value it wants to persist).
 * Deliberately NO clamping/floor here — negative stock is an allowed,
 * meaningful state by design (see scripts/041-supplies-and-stock.sql's
 * "DELIBERATE DESIGN CHOICES" note). This is the "manual adjustment"
 * mutation the spec requires; it is a thin wrapper over useUpdateSupply
 * (kept separate for call-site clarity: adjusting stock is a distinct user
 * action from editing a supply's other fields).
 */
export function useAdjustSupplyStock() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      stockQuantity,
    }: {
      id: string;
      stockQuantity: number;
    }) => {
      const { data, error } = await supabase
        .from("supplies")
        .update({ stock_quantity: stockQuantity })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Supply;
    },
    onSuccess: () => {
      invalidateSupplyQueries(queryClient);
    },
    onError: (error: any) => {
      console.error("Error adjusting supply stock:", error);
      alert("Error al ajustar el stock: " + error.message);
    },
  });
}
