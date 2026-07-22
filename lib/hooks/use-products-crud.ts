"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Product, VariantGroup, VariantOption } from "@/lib/types";

/**
 * Phase 2 write hooks for `products`/`variant_groups`/`variant_options`,
 * replacing use-menu-crud.ts's burger/extra mutations for the admin CRUD
 * pages (menu/extras/precios). The order wizard/order hooks keep reading
 * through the `burgers`/`extras` compat views untouched.
 *
 * Invalidation mirrors use-menu-crud.ts's pattern (invalidate the "all"
 * admin key AND the plain customer-facing key together), extended to also
 * invalidate the LEGACY `burgers`/`extras`/`all-burgers`/`all-extras` keys.
 * Those legacy keys back use-menu.ts's useBurgers()/useExtras(), which the
 * order wizard still uses against the compat views over the same
 * `products` table — without this, an admin edit here would silently go
 * stale in the wizard until an unrelated refetch (remount/refocus). All
 * product mutations touch the same table regardless of is_addon, so it's
 * cheaper and safer to invalidate every key than to track which legacy key
 * corresponds to which row.
 */
function invalidateProductQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["products"] });
  queryClient.invalidateQueries({ queryKey: ["addon-products"] });
  queryClient.invalidateQueries({ queryKey: ["burgers"] });
  queryClient.invalidateQueries({ queryKey: ["all-burgers"] });
  queryClient.invalidateQueries({ queryKey: ["extras"] });
  queryClient.invalidateQueries({ queryKey: ["all-extras"] });
}

// ==================== PRODUCTS ====================

export function useCreateProduct() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (product: Omit<Product, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("products")
        .insert(product)
        .select()
        .single();

      if (error) throw error;
      return data as Product;
    },
    onSuccess: () => {
      invalidateProductQueries(queryClient);
    },
    onError: (error: any, variables) => {
      console.error("Error creating product:", error);
      const noun = variables?.is_addon ? "extra" : "hamburguesa";
      alert(`Error al crear ${noun}: ` + error.message);
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...product
    }: Partial<Product> & { id: string }) => {
      const { data, error } = await supabase
        .from("products")
        .update(product)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Product;
    },
    onSuccess: () => {
      invalidateProductQueries(queryClient);
    },
    onError: (error: any) => {
      console.error("Error updating product:", error);
      alert("Error al actualizar item: " + error.message);
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ id, isAddon }: { id: string; isAddon: boolean }) => {
      const { error } = await supabase.from("products").delete().eq("id", id);

      if (error) {
        // Same FK-constraint mapping use-menu-crud.ts's useDeleteBurger /
        // useDeleteExtra did, per-noun.
        if (error.code === "23503") {
          throw new Error(
            isAddon
              ? "No se puede eliminar este extra porque está siendo usado en pedidos"
              : "No se puede eliminar esta hamburguesa porque está siendo usada en pedidos o combos",
          );
        }
        throw error;
      }
    },
    onSuccess: () => {
      invalidateProductQueries(queryClient);
    },
    onError: (error: any) => {
      console.error("Error deleting product:", error);
      alert(error.message || "Error al eliminar item");
    },
  });
}

// ==================== VARIANT GROUPS ====================

function invalidateProductVariants(
  queryClient: ReturnType<typeof useQueryClient>,
  productId: string | null,
) {
  queryClient.invalidateQueries({
    queryKey: ["product-with-variants", productId],
  });
}

export function useCreateVariantGroup() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (group: Omit<VariantGroup, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("variant_groups")
        .insert(group)
        .select()
        .single();

      if (error) throw error;
      return data as VariantGroup;
    },
    onSuccess: (data) => {
      invalidateProductVariants(queryClient, data.product_id);
    },
    onError: (error: any) => {
      console.error("Error creating variant group:", error);
      alert("Error al crear grupo de variantes: " + error.message);
    },
  });
}

export function useUpdateVariantGroup() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...group
    }: Partial<VariantGroup> & { id: string }) => {
      const { data, error } = await supabase
        .from("variant_groups")
        .update(group)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as VariantGroup;
    },
    onSuccess: (data) => {
      invalidateProductVariants(queryClient, data.product_id);
    },
    onError: (error: any) => {
      console.error("Error updating variant group:", error);
      alert("Error al actualizar grupo de variantes: " + error.message);
    },
  });
}

export function useDeleteVariantGroup() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Select the row before deleting so we know which product's variant
      // cache to invalidate without requiring the caller to also pass
      // productId separately.
      const { data, error } = await supabase
        .from("variant_groups")
        .delete()
        .eq("id", id)
        .select("product_id")
        .single();

      if (error) throw error;
      return data as { product_id: string | null };
    },
    onSuccess: (data) => {
      invalidateProductVariants(queryClient, data.product_id);
    },
    onError: (error: any) => {
      console.error("Error deleting variant group:", error);
      alert("Error al eliminar grupo de variantes: " + error.message);
    },
  });
}

// ==================== VARIANT OPTIONS ====================
//
// Single-default-per-group invariant: when a mutation sets is_default =
// true on one option, every OTHER option in that same variant_group_id
// must be unset first. No SQL/RPC changes are allowed for this phase
// (scripts/010-generic-products.sql is frozen), so this is enforced here
// as two sequential Supabase calls per the task's own suggested fallback:
// (1) reset siblings to is_default = false, (2) write the target option
// with is_default = true. This is not wrapped in a real DB transaction —
// a genuinely atomic version would need a Postgres RPC — but given this
// is a single-admin internal dashboard (RLS policy is "allow all", no
// concurrent multi-tenant writers), the two-step window is an accepted,
// documented tradeoff rather than a real correctness gap today. A later
// phase can promote this to an RPC if concurrent admin edits ever become
// a real scenario.

export function useCreateVariantOption() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (
      option: Omit<VariantOption, "id" | "created_at"> & {
        /** Not persisted — only used to invalidate the right product's cache. */
        productId: string;
      },
    ) => {
      const { productId, ...optionData } = option;

      if (optionData.is_default) {
        const { error: resetError } = await supabase
          .from("variant_options")
          .update({ is_default: false })
          .eq("variant_group_id", optionData.variant_group_id);

        if (resetError) throw resetError;
      }

      const { data, error } = await supabase
        .from("variant_options")
        .insert(optionData)
        .select()
        .single();

      if (error) throw error;
      return { option: data as VariantOption, productId };
    },
    onSuccess: ({ productId }) => {
      invalidateProductVariants(queryClient, productId);
    },
    onError: (error: any) => {
      console.error("Error creating variant option:", error);
      alert("Error al crear opción: " + error.message);
    },
  });
}

export function useUpdateVariantOption() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      productId,
      ...option
    }: Partial<VariantOption> & { id: string; productId: string }) => {
      if (option.is_default) {
        let groupId = option.variant_group_id;

        if (!groupId) {
          const { data: current, error: fetchError } = await supabase
            .from("variant_options")
            .select("variant_group_id")
            .eq("id", id)
            .single();

          if (fetchError) throw fetchError;
          groupId = current.variant_group_id;
        }

        const { error: resetError } = await supabase
          .from("variant_options")
          .update({ is_default: false })
          .eq("variant_group_id", groupId)
          .neq("id", id);

        if (resetError) throw resetError;
      }

      const { data, error } = await supabase
        .from("variant_options")
        .update(option)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { option: data as VariantOption, productId };
    },
    onSuccess: ({ productId }) => {
      invalidateProductVariants(queryClient, productId);
    },
    onError: (error: any) => {
      console.error("Error updating variant option:", error);
      alert("Error al actualizar opción: " + error.message);
    },
  });
}

export function useDeleteVariantOption() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      productId,
    }: {
      id: string;
      /** Not persisted — only used to invalidate the right product's cache. */
      productId: string;
    }) => {
      const { error } = await supabase
        .from("variant_options")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return { productId };
    },
    onSuccess: ({ productId }) => {
      invalidateProductVariants(queryClient, productId);
    },
    onError: (error: any) => {
      console.error("Error deleting variant option:", error);
      alert("Error al eliminar opción: " + error.message);
    },
  });
}
