"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface OrderItemInput {
  burger_id: string | null;
  combo_id?: string | null;
  extra_id?: string | null; // 🆕 sides
  burger_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  customizations?: string;
  extras: {
    extra_id: string;
    extra_name: string;
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
      const total = itemsTotal - discountAmount + input.delivery_fee;

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
        })
        .select()
        .single();

      if (error) throw error;

      for (const item of input.items) {
        const { data: orderItem, error: itemError } = await supabase
          .from("order_items")
          .insert({
            order_id: order.id,
            burger_id: item.burger_id,
            combo_id: item.combo_id ?? null,
            extra_id: item.extra_id ?? null, // 🆕
            burger_name: item.burger_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.subtotal,
            customizations: item.customizations ?? null,
          })
          .select()
          .single();

        if (itemError) throw itemError;

        if (item.extras.length) {
          await supabase.from("order_item_extras").insert(
            item.extras.map((ext) => ({
              order_item_id: orderItem.id,
              extra_id: ext.extra_id,
              extra_name: ext.extra_name,
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