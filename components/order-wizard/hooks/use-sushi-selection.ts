import { useState } from "react";
import { nanoid } from "nanoid";
import type { Burger } from "@/lib/types";
import type { SelectedSushiItem } from "@/lib/types/sushi-types";
import type { SushiPieceSelection } from "../adapters/sushi-piece-selector";

/**
 * Sibling to use-burger-selection.ts, for the "piece-selector" orderFlow
 * (sushi today — see lib/verticals/sushi.ts). Manages the wizard's sushi
 * line items, wrapping components/order-wizard/adapters/sushi-piece-selector.tsx's
 * per-product piece-count picker with quantity + add/remove affordances
 * that component doesn't own itself (it only reports a single selection
 * change for one product; it has no concept of quantity or of being one of
 * several selected lines).
 *
 * Judgment call: `addItem` MERGES by product id (increments quantity of an
 * existing line, like useSidesSelection's addSide) rather than always
 * pushing a new line (like useBurgerSelection's addBurger). Sushi's
 * per-product customization is a single "Piezas" choice, not burger's rich
 * multi-axis customization (meat/fries/ingredients/extras), so there's much
 * less reason for the same product to appear as multiple independently-
 * configured lines. Trade-off: a customer wanting the SAME roll in two
 * different piece counts (e.g. one "4 piezas" + one "8 piezas") can't
 * express that as two lines through this UI today — an acceptable "minimal
 * reasonable UI" limitation per the task's own framing, not a hidden gap.
 */
export function useSushiSelection() {
  const [selectedItems, setSelectedItems] = useState<SelectedSushiItem[]>([]);

  const addItem = (product: Burger) => {
    setSelectedItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      const newItem: SelectedSushiItem = {
        id: nanoid(),
        product,
        quantity: 1,
        variantOptionId: null,
        variantOptionLabel: null,
        pieceCount: null,
        // Defaults to base_price until the user actively picks a piece-count
        // option (SushiPieceSelector's onSelectionChange fires only on user
        // interaction, not on mount). base_price is the correct default:
        // sushiVertical.seedTemplate documents the default "4 piezas" option
        // as price_delta: 0, i.e. base_price already covers the default
        // piece count.
        unitPrice: product.base_price,
      };
      return [...prev, newItem];
    });
  };

  const removeItem = (itemId: string) => {
    setSelectedItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setSelectedItems((prev) =>
      prev
        .map((item) =>
          item.id === itemId
            ? { ...item, quantity: item.quantity + delta }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const updateSelection = (itemId: string, selection: SushiPieceSelection) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              variantOptionId: selection.variantOptionId,
              variantOptionLabel: selection.label,
              pieceCount: selection.pieceCount,
              unitPrice: selection.totalPrice,
            }
          : item,
      ),
    );
  };

  const reset = () => {
    setSelectedItems([]);
  };

  // Sibling to useBurgerSelection's loadBurgers loader — used by edit mode
  // (order-data-loader.ts's loadSushiItems) to populate sushi state from an
  // existing order's items.
  const loadItems = (items: SelectedSushiItem[]) => {
    setSelectedItems(items);
  };

  return {
    selectedItems,
    addItem,
    removeItem,
    updateQuantity,
    updateSelection,
    loadItems,
    reset,
  };
}
