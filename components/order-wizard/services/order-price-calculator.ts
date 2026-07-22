import { SelectedBurger } from "@/lib/types/combo-types";
import { SelectedSide } from "../hooks/use-side-selection";

interface SelectedComboSlot {
  slotId: string;
  slotType: "burger" | "drink" | "side" | "nuggets";
  maxQuantity: number;
  defaultMeatCount?: number;
  burgers: SelectedBurger[];
  selectedExtras?: Array<{
    id: string;
    name: string;
    price: number;
  }>;
}

interface SelectedCombo {
  id: string;
  combo: { id: string; name: string; price: number };
  quantity: number;
  slots: SelectedComboSlot[];
}

interface PriceCalculatorParams {
  selectedBurgers: SelectedBurger[];
  selectedCombos: SelectedCombo[];
  selectedSides: SelectedSide[];
  deliveryType: "delivery" | "pickup";
  deliveryFee: number;
  meatExtra?: { price: number } | null;
  friesExtra?: { price: number } | null;
  discountType?: "amount" | "percentage" | "none";
  discountValue?: number;
}

export class OrderPriceCalculator {
  /**
   * Phase 3: the burger-only (non-combo) total no longer needs a
   * `friesExtra` param at all — `meatPriceAdjustment` and
   * `friesPriceAdjustment` are now both resolved per-item, at
   * selection/update time, straight from the burger's own
   * "Medallones"/"Papas" variant_options.price_delta (see
   * lib/utils/variant-pricing.ts and
   * components/order-wizard/hooks/use-burger-selection.ts). This is
   * algebraically identical to the old
   * `(base_price + meatPriceAdjustment) * quantity + friesDiff * friesExtra.price * quantity`
   * formula — both deltas are per-unit and get scaled by `quantity`
   * together here instead of separately, which distributes to the exact
   * same number. Combo-slot burgers are untouched (calculateCombosTotal
   * still uses the old meatExtra/friesExtra-based formula — combos are
   * Phase 5's job).
   */
  static calculateBurgersTotal(burgers: SelectedBurger[]): number {
    return burgers.reduce((total, item) => {
      const variantDelta =
        (item.meatPriceAdjustment ?? 0) + (item.friesPriceAdjustment ?? 0);
      const burgerTotal = (item.burger.base_price + variantDelta) * item.quantity;

      const extrasTotal = item.selectedExtras.reduce(
        (acc, ext) => acc + ext.extra.price * ext.quantity,
        0,
      );

      return total + burgerTotal + extrasTotal;
    }, 0);
  }

  static calculateCombosTotal(
    combos: SelectedCombo[],
    meatExtra?: { price: number } | null,
    friesExtra?: { price: number } | null,
  ): number {
    return combos.reduce((comboAcc, c) => {
      const comboBasePrice = (c.combo?.price ?? 0) * c.quantity;

      const comboExtrasAndMore = c.slots.reduce((slotAcc, slot) => {
        const slotTotal = slot.burgers.reduce((burgerAcc, burger) => {
          const burgerExtras = burger.selectedExtras.reduce(
            (extAcc, ext) => extAcc + (ext.extra?.price ?? 0) * ext.quantity,
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

          return (
            burgerAcc +
            (burgerExtras + meatAdjustment + friesAdjustment) * burger.quantity
          );
        }, 0);

        // Drink/side slots are included in the combo price — no extra charge
        return slotAcc + slotTotal;
      }, 0);

      return comboAcc + comboBasePrice + comboExtrasAndMore;
    }, 0);
  }

  static calculateExtrasTotal(burgers: SelectedBurger[]): number {
    return burgers.reduce((total, item) => {
      const itemExtrasTotal = item.selectedExtras.reduce(
        (acc, ext) => acc + ext.extra.price * ext.quantity,
        0,
      );
      return total + itemExtrasTotal * item.quantity;
    }, 0);
  }

  static calculateDiscountAmount(
    subtotal: number,
    discountType: "amount" | "percentage" | "none",
    discountValue: number,
  ): number {
    const safeSubtotal = Number(subtotal) || 0;
    const safeValue = Number(discountValue) || 0;

    if (discountType === "none" || safeValue <= 0) {
      return 0;
    }

    if (discountType === "amount") {
      return Math.min(safeValue, safeSubtotal);
    }

    if (discountType === "percentage") {
      const percentage = Math.min(safeValue, 100);
      return (safeSubtotal * percentage) / 100;
    }

    return 0;
  }

  static calculateOrderTotal(params: {
    selectedBurgers: SelectedBurger[];
    selectedCombos: any[];
    selectedSides: SelectedSide[]; // ✅
    deliveryType: string;
    deliveryFee: number;
    meatExtra?: { price: number } | null;
    friesExtra?: { price: number } | null;
    discountType?: string;
    discountValue?: number;
  }) {
    const safeBurgers = Array.isArray(params.selectedBurgers)
      ? params.selectedBurgers
      : [];
    const safeCombos = Array.isArray(params.selectedCombos)
      ? params.selectedCombos
      : [];
    const safeSides = Array.isArray(params.selectedSides) // ✅
      ? params.selectedSides
      : [];

    const subtotal = this.calculateSubtotal(
      safeBurgers,
      safeCombos,
      safeSides, // ✅
      params.meatExtra,
      params.friesExtra,
    );

    console.log("🔍 SUBTOTAL:", subtotal);

    const normalizedDiscountType =
      params.discountType === "amount" || params.discountType === "percentage"
        ? params.discountType
        : "none";

    const discountAmount = this.calculateDiscountAmount(
      subtotal,
      normalizedDiscountType,
      params.discountValue || 0,
    );

    console.log("🔍 DISCOUNT AMOUNT:", discountAmount);

    const deliveryFee =
      params.deliveryType === "delivery" ? Number(params.deliveryFee) || 0 : 0;

    console.log("🔍 DELIVERY FEE:", deliveryFee);

    const total = subtotal - discountAmount + deliveryFee;

    console.log("🔍 TOTAL FINAL:", total);

    return Number.isFinite(total) ? total : 0;
  }

  static calculateSubtotal(
    selectedBurgers: SelectedBurger[],
    selectedCombos: SelectedCombo[],
    selectedSides: SelectedSide[],
    meatExtra?: { price: number } | null,
    friesExtra?: { price: number } | null,
  ): number {
    const burgersTotal = this.calculateBurgersTotal(selectedBurgers);

    const combosTotal = this.calculateCombosTotal(
      selectedCombos,
      meatExtra,
      friesExtra,
    );

    // ✅ Guard + incluye selectedExtras de cada side
    const safeSides = Array.isArray(selectedSides) ? selectedSides : [];
    const sidesTotal = safeSides.reduce((acc, side) => {
      const base = side.extra.price * side.quantity;
      const extras = side.selectedExtras.reduce(
        (sum, e) => sum + e.extra.price * e.quantity,
        0,
      );
      return acc + base + extras;
    }, 0);

    return burgersTotal + combosTotal + sidesTotal;
  }
}