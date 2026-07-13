import { useState } from "react";
import { nanoid } from "nanoid";
import type { Burger, Extra } from "@/lib/types";
import { SelectedBurger } from "@/lib/types/combo-types";

export function useBurgerSelection(meatExtra?: { price: number } | null) {
  const [selectedBurgers, setSelectedBurgers] = useState<SelectedBurger[]>([]);
  const [expandedBurger, setExpandedBurger] = useState<string | null>(null);

  const addBurger = (burger: Burger) => {
    const newBurger: SelectedBurger = {
      id: nanoid(),
      burger,
      quantity: 1,
      meatCount: burger.default_meat_quantity ?? 2,
      meatPriceAdjustment: 0,
      removedIngredients: [],
      selectedExtras: [],
      friesQuantity: burger.default_fries_quantity ?? 1,
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
        const meatDiff = newMeatCount - (b.burger.default_meat_quantity ?? 2); // ✅
        const meatPriceAdjustment = meatExtra ? meatDiff * meatExtra.price : 0;

        return {
          ...b,
          meatCount: newMeatCount,
          meatPriceAdjustment,
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
        return {
          ...b,
          friesQuantity: Math.max(0, b.friesQuantity + delta),
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
