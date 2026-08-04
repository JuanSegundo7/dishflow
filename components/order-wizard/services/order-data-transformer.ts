import type { OrderItemInput } from "@/lib/hooks/orders/use-create-order";
import { SelectedBurger } from "@/lib/types/combo-types";
import { SelectedSushiItem } from "@/lib/types/sushi-types";
import { SelectedSide } from "../hooks/use-side-selection";

interface SelectedComboSlot {
  slotId: string;
  slotType: "burger" | "drink" | "side" | "nuggets";
  maxQuantity: number;
  defaultMeatCount?: number;
  burgers: SelectedBurger[];
  selectedExtras: Array<{ id: string; name: string; price: number }>;
}

interface SelectedCombo {
  id: string;
  combo: { id: string; name: string; price: number };
  quantity: number;
  slots: SelectedComboSlot[];
}

export class OrderDataTransformer {
  /**
   * Phase 3: no longer takes a `friesExtra` param — `meatPriceAdjustment`
   * and the new `friesPriceAdjustment` are both resolved earlier, per item,
   * straight from the burger's own variant_options.price_delta (see
   * components/order-wizard/hooks/use-burger-selection.ts and
   * lib/utils/variant-pricing.ts), so this function only needs to read
   * them off the item. `unit_price`/`subtotal` keep the exact same shape as
   * before (meat baked into unit_price, fries only reflected in subtotal —
   * a pre-existing asymmetry, preserved here unchanged since it doesn't
   * affect the final order total, which is always driven by `subtotal`).
   *
   * `variant_selections` is a NEW, additive companion to `customizations` —
   * see scripts/020-order-items-variant-selections.sql. It is the frozen
   * price snapshot: `customizations` keeps being written exactly as before
   * (Phase 4 and other current readers still depend on it existing).
   */
  static transformBurgersToOrderItems(burgers: SelectedBurger[]): OrderItemInput[] {
    return burgers.map((item) => {
      const unitPrice = item.burger.base_price + item.meatPriceAdjustment;
      const friesAdjustment = (item.friesPriceAdjustment ?? 0) * item.quantity;

      const customizationData = {
        meatCount: item.meatCount,
        isVeggie: item.isVeggie ?? false,
        friesQuantity: item.friesQuantity,
        friesAdjustment,
        removedIngredients: item.removedIngredients,
        extras: item.selectedExtras.map((ext) => ({
          id: ext.extra.id,
          name: ext.extra.name,
          quantity: ext.quantity,
          price: ext.extra.price,
        })),
      };

      return {
        product_id: item.burger.id,
        kind: "product",
        combo_id: null,
        burger_name: item.burger.name,
        name_snapshot: item.burger.name,
        quantity: item.quantity,
        unit_price: unitPrice,
        subtotal: unitPrice * item.quantity + friesAdjustment,
        customizations: JSON.stringify(customizationData),
        variant_selections: item.variantSelections ?? null,
        extras: item.selectedExtras.map((ext) => ({
          product_id: ext.extra.id,
          name_snapshot: ext.extra.name,
          quantity: ext.quantity,
          unit_price: ext.extra.price,
          subtotal: ext.extra.price * ext.quantity,
        })),
      };
    });
  }

  static transformCombosToOrderItems(
    combos: SelectedCombo[],
    meatExtra?: { price: number } | null,
    friesExtra?: { price: number } | null,
  ): OrderItemInput[] {
    return combos.map((c) => {
      let comboSubtotal = c.combo.price * c.quantity;

      c.slots.forEach((slot) => {
        slot.burgers.forEach((burger) => {
          const burgerExtras = burger.selectedExtras.reduce(
            (acc, ext) => acc + ext.extra.price * ext.quantity,
            0,
          );

          let meatAdjustment = 0;
          if (meatExtra) {
            const referenceMeatCount =
              slot.defaultMeatCount ?? burger.burger.default_meat_quantity ?? 2;
            const meatDiff = burger.meatCount - referenceMeatCount;
            meatAdjustment = meatDiff * meatExtra.price;
          }

          let friesAdjustment = 0;
          if (friesExtra) {
            const referenceFriesCount =
              burger.referenceFriesQuantity ??
              burger.burger.default_fries_quantity ??
              1;
            const friesDiff = burger.friesQuantity - referenceFriesCount;
            friesAdjustment = friesDiff * friesExtra.price;
          }

          comboSubtotal +=
            (burgerExtras + meatAdjustment + friesAdjustment) * burger.quantity;
        });

        // Drink/side slots are included in the combo price — no extra charge
      });

      return {
        product_id: null,
        kind: "combo",
        combo_id: c.combo.id,
        burger_name: c.combo.name,
        name_snapshot: c.combo.name,
        quantity: c.quantity,
        unit_price: c.combo.price,
        subtotal: comboSubtotal,
        customizations: JSON.stringify(
          c.slots.map((s) => ({
            slotId: s.slotId,
            slotType: s.slotType,
            burgers: s.burgers.map((b) => ({
              burgerId: b.burger.id,
              name: b.burger.name,
              meatCount: b.meatCount,
              isVeggie: b.isVeggie ?? false,
              friesQuantity: b.friesQuantity,
              friesAdjustment: friesExtra
                ? (b.friesQuantity - (b.referenceFriesQuantity ?? b.burger.default_fries_quantity ?? 1)) *
                  friesExtra.price *
                  b.quantity
                : 0,
              quantity: b.quantity,
              removedIngredients: b.removedIngredients,
              extras: b.selectedExtras.map((ext) => ({
                id: ext.extra.id,
                name: ext.extra.name,
                quantity: ext.quantity,
                price: ext.extra.price,
              })),
            })),
            selectedExtras: (s.selectedExtras ?? []).map((e) => ({
              id: e.id,
              name: e.name,
              price: e.price,
            })),
          })),
        ),
        extras: [],
      };
    });
  }

  /**
   * "piece-selector" orderFlow (sushi) counterpart to
   * transformBurgersToOrderItems. `kind: "product"` — same discriminant a
   * burger line uses (see OrderItemInput's doc comment: `kind` picks what
   * `product_id` points at, and both a burger and a sushi roll ARE
   * `products` rows). `variant_selections` is left null: unlike burger's
   * Medallones/Papas snapshot (which needs variant_group_id/label that
   * SushiPieceSelection doesn't carry — see its own interface), the spec
   * for this flow only calls for capturing piece count/label in
   * `customizations`, not a frozen variant_selections snapshot.
   */
  static transformSushiToOrderItems(items: SelectedSushiItem[]): OrderItemInput[] {
    return items.map((item) => {
      const customizationData = {
        variantOptionId: item.variantOptionId,
        variantOptionLabel: item.variantOptionLabel,
        pieceCount: item.pieceCount,
      };

      return {
        product_id: item.product.id,
        kind: "product",
        combo_id: null,
        burger_name: item.product.name,
        name_snapshot: item.product.name,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        subtotal: item.unitPrice * item.quantity,
        customizations: JSON.stringify(customizationData),
        variant_selections: null,
        extras: [],
      };
    });
  }

  // 🆕 Sides como order items independientes
static transformSidesToOrderItems(sides: SelectedSide[]): OrderItemInput[] {
  return sides.map((s) => ({
    product_id: s.extra.id,
    kind: "addon",
    combo_id: null,
    burger_name: s.extra.name,
    name_snapshot: s.extra.name,
    quantity: s.quantity,
    unit_price: s.extra.price,

    // 🔥 SOLO el precio base
    subtotal: s.extra.price * s.quantity,

    customizations: null,

    // los extras van separados
    extras: s.selectedExtras.map((e) => ({
      product_id: e.extra.id,
      name_snapshot: e.extra.name,
      quantity: e.quantity,
      unit_price: e.extra.price,
      subtotal: e.extra.price * e.quantity,
    })),
  }));
}

  static transformToOrderPayload(
    burgers: SelectedBurger[],
    combos: SelectedCombo[],
    meatExtra?: { price: number } | null,
    friesExtra?: { price: number } | null,
    sides?: SelectedSide[],
  ): OrderItemInput[] {
    const comboItems = this.transformCombosToOrderItems(combos, meatExtra, friesExtra);
    const burgerItems = this.transformBurgersToOrderItems(burgers);
    const sideItems = sides?.length ? this.transformSidesToOrderItems(sides) : [];

    return [...comboItems, ...burgerItems, ...sideItems];
  }
}