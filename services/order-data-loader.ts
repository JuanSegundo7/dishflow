import { nanoid } from "nanoid";
import type { Extra } from "@/lib/types";
import type { OrderWithItems } from "@/lib/types";
import { SelectedBurger, SelectedCombo } from "@/lib/types/combo-types";
import { SelectedSide } from "@/components/order-wizard/hooks/use-side-selection";
import type { SelectedSushiItem } from "@/lib/types/sushi-types";
import type { OrderFlow } from "@/lib/verticals";

export function loadOrderIntoWizard(
  order: OrderWithItems,
  allExtras: Extra[],
  allBurgers: any[],
  allCombos: any[],
  meatExtra?: { price: number } | null,
  friesExtra?: { price: number } | null,
  // "piece-selector" (sushi) orderFlow gate — see loadSushiItems below.
  // Sushi order_items carry the same `kind: "product"` discriminator burger
  // order_items use (OrderDataTransformer.transformSushiToOrderItems mirrors
  // transformBurgersToOrderItems here), so without this gate a sushi order
  // would misfire into loadBurgers and build garbage meat/fries fields off a
  // product that has none of that. Every other value — including the
  // unimplemented "size-crust-selector" — falls back to loadBurgers exactly
  // as before, same as the rest of the app's orderFlow fallback pattern.
  orderFlow: OrderFlow = "builder-wizard",
) {
  const isSushiFlow = orderFlow === "piece-selector";

  return {
    customerData: loadCustomerData(order),
    // `burgers`/`sushi` are always both present (like `combos`/`sides`
    // already are) so callers don't need to branch on orderFlow — whichever
    // flow is inactive just returns [].
    burgers: isSushiFlow
      ? []
      : loadBurgers(order, allBurgers, allExtras, meatExtra, friesExtra),
    sushi: isSushiFlow ? loadSushiItems(order, allBurgers) : [],
    combos: loadCombos(order, allCombos, allBurgers, allExtras),
    settings: loadSettings(order),
    sides: loadSides(order, allExtras),
  };
}

function loadCustomerData(order: OrderWithItems) {
  return {
    customerName: order.customer_name,
    customerId: order.customer_id,
    addressId: order.customer_address_id,
    address: order.customer_address || null,
  };
}

function loadSettings(order: OrderWithItems) {
  // 🔑 Si quedó "delivery" sin dirección guardada, mostrar como retiro en el local
  const deliveryType: "delivery" | "pickup" =
    order.delivery_type === "delivery" && !order.customer_address_id
      ? "pickup"
      : (order.delivery_type as "delivery" | "pickup");

  return {
    deliveryType,
    deliveryFee: order.delivery_fee || 0,
    deliveryTime: order.delivery_time || "",
    paymentMethod: order.payment_method as "cash" | "transfer",
    discountType:
      (order.discount_type as "amount" | "percentage" | "none") || "none",
    discountValue: order.discount_value || 0,
    notes: order.notes || "",
    // Cost/stock/finance porting, PR2: reload the order's frozen source
    // when editing — commission_rate/commission_amount are NOT reloaded
    // into wizard state here (they're re-derived live from the reloaded
    // `source` + current getOrderSources() config by use-order-wizard.ts's
    // own commissionRate/commissionAmount memos), matching how every other
    // derived total in this wizard already gets recomputed on load rather
    // than trusting a stale persisted value.
    source: order.source ?? null,
  };
}

function loadBurgers(
  order: OrderWithItems,
  allBurgers: any[],
  allExtras: Extra[],
  meatExtra?: { price: number } | null,
  friesExtra?: { price: number } | null,
): SelectedBurger[] {
  // Phase 4 (scripts/030-order-items-cutover.sql): kind is now an explicit
  // discriminator instead of the old "burger_id/extra_id/combo_id presence"
  // convention.
  const burgerItems = order.items.filter((item) => item.kind === "product");

  return burgerItems
    .map((item) => {
      const burger = allBurgers.find((b) => b.id === item.product_id);
      if (!burger) {
        console.warn(`Burger ${item.product_id} not found`);
        return null;
      }

      let customData: any = null;
      if (item.customizations) {
        try {
          customData = JSON.parse(item.customizations);
        } catch (e) {
          console.warn("Failed to parse burger customizations:", e);
        }
      }

      const selectedExtras = (item.extras || []).map((extraItem) => {
        const extra = allExtras.find((e) => e.id === extraItem.product_id);
        return {
          extra: extra || {
            id: extraItem.product_id,
            name: extraItem.name_snapshot,
            price: extraItem.unit_price,
            category: "extra" as const,
            is_available: true,
            created_at: new Date().toISOString(),
          },
          quantity: extraItem.quantity,
        };
      });

      const meatCount =
        customData?.meatCount || burger.default_meat_quantity || 2;
      const friesQuantity =
        customData?.friesQuantity ?? burger.default_fries_quantity ?? 1;

      // ---- Phase 3 price freeze (scripts/020-order-items-variant-selections.sql) ----
      // If this order_item carries a frozen variant_selections snapshot, it
      // was created after Phase 3 shipped: reconstruct straight from those
      // stored price_delta values and never touch today's live extras
      // prices. If it's null, this is a pre-Phase-3 order — fall back to
      // the EXACT re-derivation-from-current-price behavior this file
      // always had, unchanged. Old orders intentionally do NOT get price
      // freezing applied retroactively; that's expected, not a bug.
      const frozenSelections = item.variant_selections;
      let meatPriceAdjustment: number;
      let friesPriceAdjustment: number;
      let variantSelections: SelectedBurger["variantSelections"];

      if (frozenSelections && frozenSelections.length > 0) {
        meatPriceAdjustment =
          frozenSelections.find((v) => v.variant_group_label === "Medallones")
            ?.price_delta ?? 0;
        friesPriceAdjustment =
          frozenSelections.find((v) => v.variant_group_label === "Papas")
            ?.price_delta ?? 0;
        variantSelections = frozenSelections;
      } else {
        const meatDiff = meatCount - (burger.default_meat_quantity || 2);
        meatPriceAdjustment = meatExtra ? meatDiff * meatExtra.price : 0;

        const baseFries = burger.default_fries_quantity ?? 1;
        const friesDiff = friesQuantity - baseFries;
        friesPriceAdjustment = friesExtra ? friesDiff * friesExtra.price : 0;

        // Deliberately left undefined here (not reconstructed from today's
        // live variant_options): doing so would let a no-op resave of an
        // untouched legacy order silently "freeze" it using whatever the
        // live variant_options happen to be right now, which could already
        // have drifted from the meatExtra/friesExtra prices used just above
        // for the SAME numbers — a real inconsistency, not just a cosmetic
        // one. Only actively touching the meat/fries steppers (see
        // use-burger-selection.ts) produces a fresh, internally-consistent
        // variantSelections snapshot.
        variantSelections = undefined;
      }

      return {
        id: nanoid(),
        burger,
        quantity: item.quantity,
        meatCount,
        isVeggie: customData?.isVeggie ?? false,
        friesQuantity,
        removedIngredients: customData?.removedIngredients || [],
        selectedExtras,
        meatPriceAdjustment,
        friesPriceAdjustment,
        variantSelections,
      };
    })
    .filter(Boolean) as SelectedBurger[];
}

/**
 * "piece-selector" orderFlow (sushi) counterpart to loadBurgers. Sibling in
 * spirit, but simple: sushi has no price-freeze/variant-adjustment
 * complexity (no meat/fries steppers), so `unitPrice` is read straight off
 * `item.unit_price` and `variantOptionId`/`variantOptionLabel`/`pieceCount`
 * come straight off `item.customizations` — exactly the shape
 * OrderDataTransformer.transformSushiToOrderItems writes.
 */
function loadSushiItems(
  order: OrderWithItems,
  allBurgers: any[],
): SelectedSushiItem[] {
  // Same `kind: "product"` discriminator as loadBurgers — see
  // loadOrderIntoWizard's orderFlow gate above for why only one of
  // loadBurgers/loadSushiItems ever runs against these items.
  const sushiItems = order.items.filter((item) => item.kind === "product");

  return sushiItems
    .map((item) => {
      const product = allBurgers.find((b) => b.id === item.product_id);
      if (!product) {
        console.warn(`Sushi product ${item.product_id} not found`);
        return null;
      }

      let customData: any = null;
      if (item.customizations) {
        try {
          customData = JSON.parse(item.customizations);
        } catch (e) {
          console.warn("Failed to parse sushi customizations:", e);
        }
      }

      return {
        id: nanoid(),
        product,
        quantity: item.quantity,
        variantOptionId: customData?.variantOptionId ?? null,
        variantOptionLabel: customData?.variantOptionLabel ?? null,
        pieceCount: customData?.pieceCount ?? null,
        unitPrice: item.unit_price,
      };
    })
    .filter(Boolean) as SelectedSushiItem[];
}

function loadSides(order: OrderWithItems, allExtras: Extra[]): SelectedSide[] {
  const sideItems = order.items.filter((item) => item.kind === "addon");

  return sideItems.map((item) => {
    const extra = allExtras.find((e) => e.id === item.product_id);

    const selectedExtras = (item.extras || []).map((extraItem) => {
      const e = allExtras.find((e) => e.id === extraItem.product_id);
      return {
        extra: e || {
          id: extraItem.product_id,
          name: extraItem.name_snapshot,
          price: extraItem.unit_price,
          category: "extra" as const,
          is_available: true,
          created_at: new Date().toISOString(),
        },
        quantity: extraItem.quantity,
      };
    });

    if (!extra) {
      return {
        id: nanoid(),
        extra: {
          id: item.product_id!,
          name: item.burger_name,
          price: item.unit_price,
          category: "sides" as const,
          is_available: true,
          created_at: new Date().toISOString(),
        } as Extra,
        quantity: item.quantity,
        selectedExtras,
        expanded: false,
      };
    }

    return {
      id: nanoid(),
      extra,
      quantity: item.quantity,
      selectedExtras,
      expanded: false,
    };
  });
}

function loadCombos(
  order: OrderWithItems,
  allCombos: any[],
  allBurgers: any[],
  allExtras: Extra[],
): SelectedCombo[] {
  const comboItems = order.items.filter((item) => item.combo_id);

  return comboItems
    .map((item) => {
      const combo = allCombos.find((c) => c.id === item.combo_id);

      let slotsData: any[] = [];
      if (item.customizations) {
        try {
          slotsData = JSON.parse(item.customizations);
        } catch (e) {
          console.warn("Failed to parse combo customizations:", e);
        }
      }

      const slots = slotsData
        .map((slotData) => {
          const originalSlot = combo?.slots?.find(
            (s: any) => s.id === slotData.slotId,
          );

          if (!originalSlot && !slotData.slotId) return null;

          const burgers = (slotData.burgers || [])
            .map((burgerData: any) => {
              const burger = allBurgers.find(
                (b) => b.id === burgerData.burgerId,
              );
              if (!burger) return null;

              const selectedExtras = (burgerData.extras || []).map(
                (extraData: any) => {
                  const extra = allExtras.find((e) => e.id === extraData.id);
                  return {
                    extra: extra || {
                      id: extraData.id,
                      name: extraData.name,
                      price: extraData.price,
                      category: "extra" as const,
                      is_available: true,
                      created_at: new Date().toISOString(),
                    },
                    quantity: extraData.quantity,
                  };
                },
              );

              return {
                id: nanoid(),
                burger,
                quantity: burgerData.quantity,
                meatCount: burgerData.meatCount,
                isVeggie: burgerData.isVeggie ?? false,
                friesQuantity: burgerData.friesQuantity,
                removedIngredients: burgerData.removedIngredients || [],
                selectedExtras,
                meatPriceAdjustment: 0,
              };
            })
            .filter(Boolean);

          // Backward compat: old orders used selectedExtra (singular)
          let selectedExtras: Extra[] = [];
          if (Array.isArray(slotData.selectedExtras)) {
            selectedExtras = slotData.selectedExtras.map((se: any) => {
              const found = allExtras.find((e) => e.id === se.id);
              return (
                found || {
                  id: se.id,
                  name: se.name,
                  price: se.price || 0,
                  category: "drink" as const,
                  is_available: true,
                  created_at: new Date().toISOString(),
                }
              );
            });
          } else if (slotData.selectedExtra) {
            const found = allExtras.find(
              (e) => e.id === slotData.selectedExtra.id,
            );
            selectedExtras = [
              found || {
                id: slotData.selectedExtra.id,
                name: slotData.selectedExtra.name,
                price: slotData.selectedExtra.price || 0,
                category: "drink" as const,
                is_available: true,
                created_at: new Date().toISOString(),
              },
            ];
          }

          return {
            slotId: slotData.slotId,
            slotType: slotData.slotType,
            maxQuantity: Number(originalSlot?.quantity) ?? 1,
            minQuantity:
              Number(originalSlot?.rules?.min_quantity) ??
              Number(originalSlot?.quantity) ??
              1,
            defaultMeatCount: Number(originalSlot?.default_meat_quantity) ?? 2,
            rules: originalSlot?.rules || { min_quantity: 1, max_quantity: 1 },
            burgers,
            selectedExtras,
          };
        })
        .filter(Boolean);

      return {
        id: nanoid(),
        combo: {
          id: item.combo_id || nanoid(),
          name: item.burger_name,
          price: Number(item.unit_price) || 0,
          description: combo?.description || null,
          is_available: combo?.is_available ?? true,
          created_at: combo?.created_at || new Date().toISOString(),
          slots: combo?.slots || [],
        },
        quantity: item.quantity,
        slots,
      };
    })
    .filter(Boolean) as SelectedCombo[];
}