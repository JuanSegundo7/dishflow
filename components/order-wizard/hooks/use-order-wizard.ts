import { useMemo, useEffect, useRef } from "react";
import { useCustomerSelection } from "./use-customer-selection";
import { useBurgerSelection } from "./use-burger-selection";
import { useSushiSelection } from "./use-sushi-selection";
import { useComboSelection } from "./use-combo-selection";
import { useOrderSettings } from "./use-order-settings";
import { OrderPriceCalculator } from "../services/order-price-calculator";
import { OrderDataTransformer } from "../services/order-data-transformer";
import type { OrderFlowAdapter } from "../adapters/order-flow-adapter";
import { usePrintOrder } from "@/lib/hooks/use-print-order";
import {
  useCreateOrder,
  type OrderItemInput,
} from "@/lib/hooks/orders/use-create-order";
import {
  useCreateCustomer,
  useCreateCustomerAddress,
} from "@/lib/hooks/use-customers";
import type { Extra, OrderWithItems, VariantGroupWithOptions } from "@/lib/types";
import type { OrderFlow } from "@/lib/verticals";
import { loadOrderIntoWizard } from "@/services/order-data-loader";
import { useUpdateOrder } from "@/lib/hooks/orders/use-update-order";
import { useSidesSelection } from "./use-side-selection";
import { getOrderSources } from "@/lib/utils/commission";

interface UseOrderWizardParams {
  meatExtra?: { price: number } | null;
  friesExtra?: { price: number } | null;
  mode?: "create" | "edit";
  orderToEdit?: OrderWithItems | null;
  allBurgers?: any[];
  allCombos?: any[];
  allExtras?: Extra[];
  /**
   * Phase 3: burger_id -> variant_groups map (see `useBurgerVariantGroups`
   * in lib/hooks/use-products.ts), used by `useBurgerSelection` to price
   * meat/fries steppers off variant_options.price_delta instead of
   * `meatExtra`/`friesExtra`. `meatExtra`/`friesExtra` themselves are still
   * needed here — combos (useComboSelection/calculateCombosTotal/
   * transformCombosToOrderItems) and the summary step keep using them
   * unchanged; combos are Phase 5's job, not this one's.
   */
  burgerVariantGroups?: Record<string, VariantGroupWithOptions[]>;
  /**
   * The active vertical's order flow (see lib/verticals/types.ts's
   * OrderFlow), read by the caller (order-wizard-drawer.tsx) via
   * useVertical() and passed down here — same pattern as every other
   * vertical-derived value this hook receives as a param rather than
   * calling useVertical() itself. Selects which flow's selection
   * hook/total/transform feeds subtotal/orderTotal/handleSubmit's payload:
   * "piece-selector" uses sushi, everything else (including the
   * not-yet-built "size-crust-selector") falls back to the burger flow —
   * mirrors order-wizard-drawer.tsx's own fallback for which step
   * component to render.
   */
  orderFlow?: OrderFlow;
}

export function useOrderWizard({
  meatExtra,
  friesExtra,
  mode = "create",
  orderToEdit,
  allBurgers = [],
  allCombos = [],
  allExtras = [],
  burgerVariantGroups,
  orderFlow = "builder-wizard",
}: UseOrderWizardParams) {
  const isSubmittingRef = useRef(false);
  const isSushiFlow = orderFlow === "piece-selector";

  // ================= HOOKS =================
  const customer = useCustomerSelection();
  const burgers = useBurgerSelection(burgerVariantGroups);
  const sushi = useSushiSelection();
  const combos = useComboSelection();
  const settings = useOrderSettings();
  const sides = useSidesSelection();

  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const createCustomer = useCreateCustomer();
  const createCustomerAddress = useCreateCustomerAddress();
  const printOrder = usePrintOrder();

  // ================= COMPUTED =================

  // ================= ORDER FLOW ADAPTERS =================
  // See adapters/order-flow-adapter.ts's doc comment for why this exists
  // and why `total` is NOT threaded through calculateSubtotal's existing
  // `selectedBurgers` argument for the burger flow — that call path is
  // untouched below, guaranteeing a no-op for orderFlow: "builder-wizard".
  const burgerFlowAdapter: OrderFlowAdapter = useMemo(
    () => ({
      canProceed: true,
      total: OrderPriceCalculator.calculateBurgersTotal(
        burgers.selectedBurgers,
      ),
      toOrderItems: () =>
        OrderDataTransformer.transformBurgersToOrderItems(
          burgers.selectedBurgers,
        ),
    }),
    [burgers.selectedBurgers],
  );

  const sushiFlowAdapter: OrderFlowAdapter = useMemo(
    () => ({
      canProceed: true,
      total: OrderPriceCalculator.calculateSushiTotal(sushi.selectedItems),
      toOrderItems: () =>
        OrderDataTransformer.transformSushiToOrderItems(sushi.selectedItems),
    }),
    [sushi.selectedItems],
  );

  const activeFlowAdapter = isSushiFlow ? sushiFlowAdapter : burgerFlowAdapter;

  // Only the sushi flow's total is ever added on top — for the burger flow
  // this is always 0, and calculateSubtotal/calculateOrderTotal's burger
  // math below still runs exactly as before via `burgers.selectedBurgers`.
  const sushiAdditionalTotal = isSushiFlow ? sushiFlowAdapter.total : 0;

  const subtotal = useMemo(() => {
    return OrderPriceCalculator.calculateSubtotal(
      burgers.selectedBurgers,
      combos.selectedCombos,
      sides.selectedSides,
      meatExtra,
      friesExtra,
      sushiAdditionalTotal,
    );
  }, [
    burgers.selectedBurgers,
    combos.selectedCombos,
    sides.selectedSides,
    meatExtra,
    friesExtra,
    sushiAdditionalTotal,
  ]);

  const discountAmount = useMemo(() => {
    return OrderPriceCalculator.calculateDiscountAmount(
      subtotal,
      settings.discountType,
      settings.discountValue,
    );
  }, [subtotal, settings.discountType, settings.discountValue]);

  // Cost/stock/finance porting, PR2: the commission rate for the wizard's
  // currently-selected source, resolved from getOrderSources() — this is
  // the SINGLE derived value both `commissionAmount` (used for on-screen
  // display below, in summary-step's commission line) and `handleSubmit`'s
  // persisted payload read from; neither one re-derives it separately, so
  // display and payload can never disagree (see this hook's own
  // orderPayload construction below).
  const commissionRate = useMemo(() => {
    if (!settings.source) return 0;
    const config = getOrderSources().find((s) => s.key === settings.source);
    return config?.commissionRate ?? 0;
  }, [settings.source]);

  const commissionAmount = useMemo(() => {
    return OrderPriceCalculator.calculateCommission(subtotal, commissionRate);
  }, [subtotal, commissionRate]);

  const orderTotal = useMemo(() => {
    const raw = OrderPriceCalculator.calculateOrderTotal({
      selectedBurgers: burgers.selectedBurgers,
      selectedCombos: combos.selectedCombos,
      selectedSides: sides.selectedSides,
      deliveryType: settings.deliveryType,
      deliveryFee: settings.deliveryFee,
      meatExtra,
      friesExtra,
      discountType: settings.discountType,
      discountValue: settings.discountValue,
      commissionRate,
      additionalTotal: sushiAdditionalTotal,
    });

    // Si el descuento es 100%, el total es 0 (incluye delivery fee)
    if (
      settings.discountType === "percentage" &&
      settings.discountValue >= 100
    ) {
      return 0;
    }

    return raw;
  }, [
    burgers.selectedBurgers,
    combos.selectedCombos,
    sides.selectedSides,
    settings.deliveryType,
    settings.deliveryFee,
    meatExtra,
    friesExtra,
    settings.discountType,
    settings.discountValue,
    commissionRate,
    sushiAdditionalTotal,
  ]);

  const extrasTotal = useMemo(() => {
    return OrderPriceCalculator.calculateExtrasTotal(burgers.selectedBurgers);
  }, [burgers.selectedBurgers]);

  const canProceedFromCustomer = customer.canProceed;

  const canProceedFromBurgers = activeFlowAdapter.canProceed;

  const canProceedFromSides =
    burgers.selectedBurgers.length > 0 ||
    sushi.selectedItems.length > 0 ||
    combos.selectedCombos.length > 0 ||
    sides.selectedSides.length > 0;

  const canProceedFromCombos = useMemo(() => {
    if (combos.selectedCombos.length === 0) return true;
    return combos.selectedCombos.every((combo) => {
      return combo.slots.every((slot) => {
        const isRequired = slot.minQuantity > 0;
        if (!isRequired) return true;
        if (slot.slotType === "burger") {
          const totalQty = slot.burgers.reduce((acc, b) => acc + b.quantity, 0);
          return totalQty >= slot.minQuantity;
        }
        if (
          slot.slotType === "drink" ||
          slot.slotType === "side" ||
          slot.slotType === "nuggets"
        ) {
          return slot.selectedExtras.length >= slot.minQuantity;
        }
        return true;
      });
    });
  }, [combos.selectedCombos]);

  // ================= LOAD DATA IN EDIT MODE =================

  useEffect(() => {
    if (mode === "edit" && orderToEdit) {
      const wizardData = loadOrderIntoWizard(
        orderToEdit,
        allExtras,
        allBurgers,
        allCombos,
        meatExtra,
        friesExtra,
        orderFlow,
      );

      customer.loadCustomerData(wizardData.customerData);
      burgers.loadBurgers(wizardData.burgers);
      sushi.loadItems(wizardData.sushi);
      combos.loadCombos(wizardData.combos);
      settings.loadSettings(wizardData.settings);
      if (wizardData.sides) {
        sides.loadSides(wizardData.sides);
      }
    }
  }, [mode, orderToEdit]);

  // ================= ACTIONS =================

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      // Reassembled here (rather than via OrderDataTransformer.
      // transformToOrderPayload, left untouched/unused for this call site)
      // so the "core items" segment can come from whichever flow is
      // active (activeFlowAdapter.toOrderItems()) instead of always
      // being burger items. For orderFlow: "builder-wizard" this produces
      // the exact same three calls, same args, same concatenation order
      // transformToOrderPayload itself would have made — a no-op.
      const comboItems = OrderDataTransformer.transformCombosToOrderItems(
        combos.selectedCombos,
        meatExtra,
        friesExtra,
      );
      const sideItems = sides.selectedSides.length
        ? OrderDataTransformer.transformSidesToOrderItems(sides.selectedSides)
        : [];
      const coreItems = activeFlowAdapter.toOrderItems();

      const allItems: OrderItemInput[] = [
        ...comboItems,
        ...coreItems,
        ...sideItems,
      ];

      if (!allItems || allItems.length === 0) {
        throw new Error("No hay items en el pedido");
      }

      let customerId = customer.selectedCustomer?.id;
      let customerAddressId = customer.selectedAddress;

      if (!customerId && mode === "create") {
        const newCustomer = await createCustomer.mutateAsync({
          name: customer.newCustomerData.name,
          phone: customer.newCustomerData.phone,
        });
        customerId = newCustomer.id;
      }

      if (
        !customerAddressId &&
        settings.deliveryType === "delivery" &&
        mode === "create"
      ) {
        if (!customerId)
          throw new Error("Customer ID is required to create address");
        const address = await createCustomerAddress.mutateAsync({
          customerId,
          address: customer.newAddressData.address,
          label: customer.newAddressData.label ?? "Principal",
          notes: customer.newAddressData.notes,
          is_default: true,
        });
        customerAddressId = address.id;
      }

      // 🔑 Si quedó "delivery" sin dirección resuelta, cae a retiro en el local
      const effectiveDeliveryType =
        settings.deliveryType === "delivery" && !customerAddressId
          ? "pickup"
          : settings.deliveryType;

      const orderPayload = {
        customer_id: customerId ?? null,
        customer_name:
          customer.selectedCustomer?.name ?? customer.newCustomerData.name,
        customer_address_id:
          effectiveDeliveryType === "delivery"
            ? (customerAddressId ?? null)
            : null,
        delivery_type: effectiveDeliveryType,
        delivery_fee:
          effectiveDeliveryType === "delivery" ? settings.deliveryFee : 0,
        payment_method: settings.paymentMethod,
        discount_type: settings.discountType,
        discount_value: settings.discountValue,
        // 🔑 FIX: discount_amount guardado en DB también refleja el total real
        // (incluye delivery fee cuando el descuento es 100%)
        discount_amount:
          orderTotal === 0
            ? subtotal +
              (effectiveDeliveryType === "delivery" ? settings.deliveryFee : 0)
            : discountAmount,
        items: allItems,
        notes: settings.notes || null,
        delivery_time: settings.deliveryTime || null,
        // Cost/stock/finance porting, PR2: frozen at submit time from the
        // SAME commissionRate/commissionAmount memos used for on-screen
        // display above — never re-read from getOrderSources() again here.
        // commission_amount is zeroed alongside discount_amount when the
        // 100%-discount override above already reduces the total to 0 —
        // without this, use-create-order.ts's `total = itemsTotal -
        // discountAmount - commissionAmount + deliveryFee` would persist a
        // NEGATIVE total_amount (≈ -commissionAmount) instead of 0, since
        // discountAmount already absorbed the entire subtotal+deliveryFee
        // and commissionAmount would then subtract again on top of that.
        // commission_rate itself is kept as configured — it's a record of
        // what rate was selected, not an amount that affects the total.
        source: settings.source,
        commission_rate: commissionRate,
        commission_amount: orderTotal === 0 ? 0 : commissionAmount,
      };

      let orderId: string;

      if (mode === "edit" && orderToEdit) {
        const updated = await updateOrder.mutateAsync({
          orderId: orderToEdit.id,
          payload: orderPayload,
        });
        orderId = updated.id;
      } else {
        const created = await createOrder.mutateAsync(orderPayload);
        orderId = created.id;
      }

      try {
        await printOrder.mutateAsync(orderId);
      } catch (printError) {
        console.warn("⚠️ No se pudo imprimir automáticamente:", printError);
      }
    } catch (error) {
      console.error("Error en submit:", error);
      throw error;
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const resetAll = () => {
    customer.reset();
    burgers.reset();
    sushi.reset();
    combos.resetState();
    settings.reset();
    sides.reset();
  };

  return {
    customer,
    burgers,
    sushi,
    combos,
    settings,
    sides,

    subtotal,
    orderTotal,
    extrasTotal,
    discountAmount,
    commissionAmount,
    commissionRate,
    canProceedFromCustomer,
    canProceedFromBurgers,
    canProceedFromSides,
    canProceedFromCombos,

    handleSubmit,
    resetAll,

    isSubmitting:
      mode === "edit" ? updateOrder.isPending : createOrder.isPending,
    isCreatingCustomer: createCustomer.isPending,
    isCreatingAddress: createCustomerAddress.isPending,

    mode,
    orderToEdit,
  };
}
