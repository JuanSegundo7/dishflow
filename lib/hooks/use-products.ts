"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  Burger,
  Extra,
  ExtraCategory,
  Product,
  ProductWithVariantGroups,
  VariantGroupWithOptions,
  VariantOption,
} from "@/lib/types";

/**
 * Phase 2 read hooks — these query `products`/`variant_groups`/
 * `variant_options` DIRECTLY, not through the `burgers`/`extras` compat
 * views (see scripts/010-generic-products.sql). They back the admin CRUD
 * pages (menu/extras/precios).
 *
 * Query key convention matched from lib/hooks/use-menu.ts /
 * use-menu-crud.ts: flat, kebab-case string arrays (["burgers"],
 * ["all-burgers"], ["all-extras"], ...), with a trailing id for
 * single-record lookups (see use-customers.ts's ["customer-addresses",
 * customerId] pattern). New keys introduced here: "products",
 * "addon-products", "product-with-variants".
 */

/** AddonProduct: a `products` row with `is_addon = true`, with
 * `legacy_extra_category` renamed to `category` in the returned shape so
 * the /extras page's existing `extra.category` grouping code needs
 * minimal changes when swapping off `use-menu-crud.ts`'s `Extra` shape. */
export interface AddonProduct extends Omit<Product, "legacy_extra_category"> {
  category: ExtraCategory | null;
}

/**
 * Non-addon products (is_addon = false) — what /menu shows today.
 * Unfiltered by is_available (mirrors use-menu-crud.ts's useAllBurgers,
 * which /menu actually reads today: the grid renders every burger,
 * available or not, dimming unavailable ones — not use-menu.ts's
 * is_available-filtered useBurgers, which is the order-wizard's hook).
 */
export function useProducts() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_addon", false)
        .order("name", { ascending: true });

      if (error) throw error;
      return data as Product[];
    },
  });
}

/**
 * Addon products (is_addon = true) — what /extras shows today. Ordered by
 * legacy_extra_category then name, mirroring useAllExtras' `.order("category")
 * .order("name")`.
 */
export function useAddonProducts() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["addon-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_addon", true)
        .order("legacy_extra_category", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return (data as Product[]).map(
        ({ legacy_extra_category, ...rest }) =>
          ({
            ...rest,
            category: legacy_extra_category as ExtraCategory | null,
          }) as AddonProduct,
      );
    },
  });
}

/**
 * Phase 4 — order wizard hooks, replacing lib/hooks/use-menu.ts's
 * useBurgers()/useExtras() as the order wizard's data source (see
 * components/order-wizard/order-wizard-drawer.tsx). Those two functions are
 * left in place in use-menu.ts (dead code now — nothing calls them) rather
 * than deleted, since the `burgers`/`extras` compat views they query are
 * only ACTUALLY dropped once scripts/031-drop-legacy-compat.sql is applied;
 * see that file's header for why it's a separate, independently-deferrable
 * migration. These new hooks query `products` directly, filtered to
 * is_available = true (matching the old compat-view hooks' filter exactly),
 * but SHAPE their results identically
 * to the `Burger`/`Extra` interfaces the rest of the order wizard already
 * consumes (use-burger-selection.ts, use-combo-selection.ts,
 * order-price-calculator.ts, order-data-transformer.ts, the step
 * components, etc.) so none of those files need to change at all — only
 * the fetch hook's data SOURCE changes, not the shape it returns. This is
 * deliberately NOT `Product`/`AddonProduct` (Phase 2's admin-page shapes):
 * those use `base_price` for both burgers and extras, whereas `Extra` uses
 * `price` — switching the wizard onto the admin shapes would require
 * renaming `.price` -> `.base_price` (and `.category` plumbing) across
 * every one of those files, a large, high-risk change to the app's most
 * critical live path for zero functional benefit. Mapping happens once,
 * here, instead.
 */
export function useAvailableProducts() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["burgers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_addon", false)
        .eq("is_available", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return data as Burger[];
    },
  });
}

export function useAvailableAddonProducts() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["extras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_addon", true)
        .eq("is_available", true)
        .order("legacy_extra_category", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return (data as Product[]).map(
        ({ id, name, legacy_extra_category, base_price, is_available, created_at }) =>
          ({
            id,
            name,
            category: legacy_extra_category as ExtraCategory,
            price: base_price,
            is_available,
            created_at,
          }) as Extra,
      );
    },
  });
}

/**
 * One product plus its variant_groups (ordered by sort_order), each with
 * its variant_options (ordered by sort_order). Intended for a variant
 * editor UI. Disabled while productId is falsy.
 */
export function useProductWithVariants(productId: string | null | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["product-with-variants", productId],
    queryFn: async () => {
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId as string)
        .single();

      if (productError) throw productError;

      const { data: groups, error: groupsError } = await supabase
        .from("variant_groups")
        .select("*, variant_options(*)")
        .eq("product_id", productId as string)
        .order("sort_order", { ascending: true });

      if (groupsError) throw groupsError;

      const variantGroups: VariantGroupWithOptions[] = (groups ?? []).map(
        (group: VariantGroupWithOptions) => ({
          ...group,
          variant_options: [...(group.variant_options ?? [])].sort(
            (a: VariantOption, b: VariantOption) =>
              a.sort_order - b.sort_order,
          ),
        }),
      );

      return {
        ...(product as Product),
        variant_groups: variantGroups,
      } as ProductWithVariantGroups;
    },
    enabled: !!productId,
  });
}

/**
 * Phase 3 (order wizard genericization) — bulk variant of
 * `useProductWithVariants`, for the order wizard's burgers step, which
 * needs every SELECTED burger's variant groups at once. Fetching one
 * product at a time (N `useProductWithVariants` calls) isn't viable here:
 * the number of selected burgers changes as the user adds/removes them,
 * which would mean a variable number of hook calls from one render to the
 * next — a Rules-of-Hooks violation. A single batched query keyed by the
 * (sorted) list of burger ids avoids that entirely and is also fewer round
 * trips than N individual fetches.
 *
 * Returns a map of product_id -> that product's variant_groups (each with
 * its variant_options, sorted by sort_order — same shape/ordering as
 * `useProductWithVariants` produces for one product).
 */
export function useBurgerVariantGroups(burgers: { id: string }[] | undefined) {
  const supabase = createClient();
  const ids = (burgers ?? []).map((b) => b.id);
  const dedupedSortedIds = Array.from(new Set(ids)).sort();
  const queryKeyId = dedupedSortedIds.join(",");

  return useQuery({
    queryKey: ["burger-variant-groups", queryKeyId],
    queryFn: async () => {
      if (dedupedSortedIds.length === 0) {
        return {} as Record<string, VariantGroupWithOptions[]>;
      }

      const { data, error } = await supabase
        .from("variant_groups")
        .select("*, variant_options(*)")
        .in("product_id", dedupedSortedIds)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      const byProductId: Record<string, VariantGroupWithOptions[]> = {};
      for (const group of (data ?? []) as VariantGroupWithOptions[]) {
        const productId = group.product_id;
        if (!productId) continue;

        const sortedOptions = [...(group.variant_options ?? [])].sort(
          (a: VariantOption, b: VariantOption) => a.sort_order - b.sort_order,
        );

        if (!byProductId[productId]) byProductId[productId] = [];
        byProductId[productId].push({ ...group, variant_options: sortedOptions });
      }

      return byProductId;
    },
    enabled: dedupedSortedIds.length > 0,
  });
}
