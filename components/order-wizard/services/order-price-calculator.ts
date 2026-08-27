import { SelectedBurger } from "@/lib/types/combo-types";
import { SelectedSushiItem } from "@/lib/types/sushi-types";
import { SelectedSide } from "../hooks/use-side-selection";
import { computeCommission } from "@/lib/utils/commission";

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

  /**
   * "piece-selector" orderFlow (sushi) counterpart to calculateBurgersTotal.
   * Piece-count pricing is already fully resolved per selection (see
   * SushiPieceSelection.totalPrice / SelectedSushiItem.unitPrice in
   * use-sushi-selection.ts), so this is just quantity * unitPrice summed —
   * no variant-group lookups needed here the way calculateBurgersTotal
   * needs meatPriceAdjustment/friesPriceAdjustment.
   */
  static calculateSushiTotal(items: SelectedSushiItem[]): number {
    return items.reduce(
      (total, item) => total + item.unitPrice * item.quantity,
      0,
    );
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

  /**
   * Cost/stock/finance porting, PR2: pure wrapper around
   * lib/utils/commission.ts's computeCommission — the ONLY entry point that
   * should compute a commission amount from an items subtotal + rate.
   * `subtotalItems` MUST be the items-only subtotal (calculateSubtotal's
   * return value) — delivery fee is deliberately excluded from the
   * commission base (confirmed business rule), so callers must never pass
   * a subtotal that already includes deliveryFee.
   */
  static calculateCommission(subtotalItems: number, rate: number): number {
    return computeCommission(subtotalItems, rate);
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
    /**
     * Cost/stock/finance porting, PR2: commission rate (%) for the order's
     * selected source (see lib/utils/commission.ts's OrderSourceConfig).
     * Optional, defaults to 0 — omitting it (every pre-PR2 caller) is a
     * byte-for-byte no-op.
     */
    commissionRate?: number;
    /**
     * "piece-selector" orderFlow (sushi) hook-in: the active flow's sushi
     * total (see calculateSushiTotal), added straight into the subtotal
     * this method computes internally. Optional, defaults to 0 — omitting
     * it (every pre-existing caller) is a byte-for-byte no-op for the
     * "builder-wizard" orderFlow.
     */
    additionalTotal?: number;
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
      params.additionalTotal ?? 0,
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

    // Commission base is `subtotal` (items only) — deliberately computed
    // BEFORE deliveryFee is added below, so delivery is never part of the
    // commission base (confirmed business rule).
    const commissionAmount = this.calculateCommission(
      subtotal,
      params.commissionRate || 0,
    );

    console.log("🔍 COMMISSION AMOUNT:", commissionAmount);

    const deliveryFee =
      params.deliveryType === "delivery" ? Number(params.deliveryFee) || 0 : 0;

    console.log("🔍 DELIVERY FEE:", deliveryFee);

    const total = subtotal - discountAmount - commissionAmount + deliveryFee;

    console.log("🔍 TOTAL FINAL:", total);

    return Number.isFinite(total) ? total : 0;
  }

  static calculateSubtotal(
    selectedBurgers: SelectedBurger[],
    selectedCombos: SelectedCombo[],
    selectedSides: SelectedSide[],
    meatExtra?: { price: number } | null,
    friesExtra?: { price: number } | null,
    /**
     * "piece-selector" orderFlow (sushi) hook-in — see calculateSushiTotal.
     * Optional, defaults to 0. Every pre-existing call site omits this, so
     * this is a no-op addition for the "builder-wizard" orderFlow.
     */
    additionalTotal: number = 0,
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

    return burgersTotal + combosTotal + sidesTotal + additionalTotal;
  }
}