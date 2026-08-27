"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { OrderItemKind, VariantSelectionEntry } from "@/lib/types";

export interface OrderItemInput {
  // Phase 4 (scripts/030-order-items-cutover.sql): replaces burger_id/
  // extra_id — both used to point at products(id) already (Phase 1's FK
  // repoint); `kind` now discriminates what this points at instead of the
  // old "which of the two nullable columns is set" convention.
  product_id: string | null;
  kind: OrderItemKind;
  combo_id?: string | null;
  burger_name: string;
  // Phase 4: additive frozen-name companion to burger_name — see
  // scripts/030-order-items-cutover.sql's "WHY burger_name IS KEPT" note.
  name_snapshot?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  customizations?: string;
  // Phase 3 (scripts/020-order-items-variant-selections.sql): frozen
  // Medallones/Papas variant-option price snapshot for this line item.
  // Additive companion to `customizations`, not a replacement — null for
  // combo/side items and for burgers whose product has no variant groups.
  variant_selections?: VariantSelectionEntry[] | null;
  extras: {
    product_id: string;
    name_snapshot: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }[];
}

export interface CreateOrderInput {
  customer_id: string | null;
  customer_name: string;
  customer_address_id?: string | null;
  delivery_type: "delivery" | "pickup";
  delivery_fee: number;
  payment_method: "cash" | "transfer";
  discount_type?: "amount" | "percentage" | "none" | null;
  discount_value?: number;
  discount_amount?: number;
  items: OrderItemInput[];
  notes: string | null;
  delivery_time?: string | null;
  // Cost/stock/finance porting, PR2: which sales channel this order came
  // from + its commission, frozen by the caller (use-order-wizard.ts) at
  // submit time from whatever getOrderSources() config was current then —
  // this hook writes them as-is, it never re-reads live source config
  // itself. `price_adjustment` is NOT threaded here — reserved column only,
  // wired starting PR3.
  source?: string | null;
  commission_rate?: number;
  commission_amount?: number;
  save_customer?: boolean;
  new_customer?: {
    name: string;
    phone?: string;
    address?: {
      label: string;
      address: string;
      notes?: string;
      is_default?: boolean;
    };
  };
}

export function useCreateOrder() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      const itemsTotal = input.items.reduce((acc, item) => {
        const extrasTotal = item.extras.reduce(
          (eAcc, e) => eAcc + e.subtotal,
          0,
        );
        return acc + item.subtotal + extrasTotal;
      }, 0);

      const discountAmount = input.discount_amount ?? 0;
      // Cost/stock/finance porting, PR2: commission is subtracted from the
      // persisted total the exact same way discountAmount already is —
      // `input.commission_amount` itself was computed by the caller
      // against items subtotal only (delivery fee excluded), so it's safe
      // to combine here alongside delivery_fee without double-counting.
      const commissionAmount = input.commission_amount ?? 0;
      const total = itemsTotal - discountAmount - commissionAmount + input.delivery_fee;

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          customer_id: input.customer_id,
          customer_name: input.customer_name,
          customer_address_id: input.customer_address_id ?? null,
          delivery_type: input.delivery_type,
          delivery_fee: input.delivery_fee,
          payment_method: input.payment_method,
          discount_type: input.discount_type ?? "none",
          discount_value: input.discount_value ?? 0,
          discount_amount: discountAmount,
          total_amount: total,
          notes: input.notes,
          delivery_time: input.delivery_time ?? null,
          status: "new",
          source: input.source ?? null,
          commission_rate: input.commission_rate ?? 0,
          commission_amount: input.commission_amount ?? 0,
        })
        .select()
        .single();

      if (error) throw error;

      for (const item of input.items) {
        const { data: orderItem, error: itemError } = await supabase
          .from("order_items")
          .insert({
            order_id: order.id,
            product_id: item.product_id,
            kind: item.kind,
            combo_id: item.combo_id ?? null,
            burger_name: item.burger_name,
            name_snapshot: item.name_snapshot ?? item.burger_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.subtotal,
            customizations: item.customizations ?? null,
            variant_selections: item.variant_selections ?? null,
          })
          .select()
          .single();

        if (itemError) throw itemError;

        if (item.extras.length) {
          await supabase.from("order_item_modifiers").insert(
            item.extras.map((ext) => ({
              order_item_id: orderItem.id,
              product_id: ext.product_id,
              name_snapshot: ext.name_snapshot,
              quantity: ext.quantity,
              unit_price: ext.unit_price,
              subtotal: ext.subtotal,
            })),
          );
        }
      }

      return order;
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-count-today"] });
    },
  });
}