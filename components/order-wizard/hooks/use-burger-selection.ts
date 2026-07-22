import { useState } from "react";
import { nanoid } from "nanoid";
import type { Burger, Extra, VariantGroupWithOptions } from "@/lib/types";
import { SelectedBurger } from "@/lib/types/combo-types";
import { buildBurgerVariantSelections } from "@/lib/utils/variant-pricing";

/**
 * Phase 3: `burgerVariantGroups` replaces the old `meatExtra`-price-based
 * formula. It's a map of product_id -> that burger's variant_groups (see
 * `useBurgerVariantGroups` in lib/hooks/use-products.ts), keyed by burger id
 * so this hook can resolve each burger's own "Medallones"/"Papas" groups
 * without needing to fetch per-item (see that hook's doc comment for why —
 * Rules of Hooks don't allow a variable number of hook calls here).
 */
export function useBurgerSelection(
  burgerVariantGroups?: Record<string, VariantGroupWithOptions[]>,
) {
  const [selectedBurgers, setSelectedBurgers] = useState<SelectedBurger[]>([]);
  const [expandedBurger, setExpandedBurger] = useState<string | null>(null);

  const addBurger = (burger: Burger) => {
    const meatCount = burger.default_meat_quantity ?? 2;
    const friesQuantity = burger.default_fries_quantity ?? 1;
    const { variantSelections, meatPriceAdjustment, friesPriceAdjustment } =
      buildBurgerVariantSelections(
        burgerVariantGroups?.[burger.id],
        meatCount,
        friesQuantity,
      );

    const newBurger: SelectedBurger = {
      id: nanoid(),
      burger,
      quantity: 1,
      meatCount,
      meatPriceAdjustment,
      friesPriceAdjustment,
      variantSelections,
      removedIngredients: [],
      selectedExtras: [],
      friesQuantity,
      isVeggie: /veggie/i.test(burger.name),
    };

    setSelectedBurgers((prev) => [...prev, newBurger]);
    setExpandedBurger(newBurger.id);
  };

  const removeBurger = (id: string) => {
    setSelectedBurgers((prev) => prev.filter((b) => b.id !== id));
    if (expandedBurger === id) {
      setExpandedBurger(null);
    }
  };

  const updateQuantity = (id: string, delta: number) => {
    setSelectedBurgers((prev) =>
      prev
        .map((b) => (b.id === id ? { ...b, quantity: b.quantity + delta } : b))
        .filter((b) => b.quantity > 0),
    );

    const burger = selectedBurgers.find((b) => b.id === id);
    if (burger && burger.quantity === 1 && delta === -1) {
      setExpandedBurger(null);
    }
  };

  const toggleIngredient = (id: string, ingredient: string) => {
    setSelectedBurgers((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;

        const removed = b.removedIngredients.includes(ingredient)
          ? b.removedIngredients.filter((i) => i !== ingredient)
          : [...b.removedIngredients, ingredient];

        return { ...b, removedIngredients: removed };
      }),
    );
  };

  const updateMeatCount = (id: string, delta: number) => {
    setSelectedBurgers((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;

        const newMeatCount = Math.max(1, b.meatCount + delta);
        const { variantSelections, meatPriceAdjustment, friesPriceAdjustment } =
          buildBurgerVariantSelections(
            burgerVariantGroups?.[b.burger.id],
            newMeatCount,
            b.friesQuantity,
          );

        return {
          ...b,
          meatCount: newMeatCount,
          meatPriceAdjustment,
          friesPriceAdjustment,
          variantSelections,
        };
      }),
    );
  };

  const toggleExtra = (id: string, extra: Extra) => {
    setSelectedBurgers((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;

        const exists = b.selectedExtras.find((e) => e.extra.id === extra.id);

        if (exists) {
          return {
            ...b,
            selectedExtras: b.selectedExtras.filter(
              (e) => e.extra.id !== extra.id,
            ),
          };
        }

        return {
          ...b,
          selectedExtras: [...b.selectedExtras, { extra, quantity: 1 }],
        };
      }),
    );
  };

  const updateExtraQuantity = (id: string, extraId: string, delta: number) => {
    setSelectedBurgers((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;

        return {
          ...b,
          selectedExtras: b.selectedExtras
            .map((e) =>
              e.extra.id === extraId
                ? { ...e, quantity: e.quantity + delta }
                : e,
            )
            .filter((e) => e.quantity > 0),
        };
      }),
    );
  };

  const toggleVeggie = (id: string) => {
    setSelectedBurgers((prev) =>
      prev.map((b) => (b.id === id ? { ...b, isVeggie: !b.isVeggie } : b)),
    );
  };

  const updateFriesQuantity = (id: string, delta: number) => {
    setSelectedBurgers((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;

        const newFriesQuantity = Math.max(0, b.friesQuantity + delta);
        const { variantSelections, meatPriceAdjustment, friesPriceAdjustment } =
          buildBurgerVariantSelections(
            burgerVariantGroups?.[b.burger.id],
            b.meatCount,
            newFriesQuantity,
          );

        return {
          ...b,
          friesQuantity: newFriesQuantity,
          meatPriceAdjustment,
          friesPriceAdjustment,
          variantSelections,
        };
      }),
    );
  };

  const toggleExpanded = (id: string) => {
    setExpandedBurger(expandedBurger === id ? null : id);
  };

  const reset = () => {
    setSelectedBurgers([]);
    setExpandedBurger(null);
  };

  const loadBurgers = (burgers: SelectedBurger[]) => {
    setSelectedBurgers(burgers);
  };

  return {
    selectedBurgers,
    expandedBurger,
    addBurger,
    removeBurger,
    updateQuantity,
    toggleIngredient,
    updateMeatCount,
    toggleExtra,
    updateExtraQuantity,
    updateFriesQuantity,
    toggleVeggie,
    loadBurgers,
    toggleExpanded,
    reset,
  };
}
