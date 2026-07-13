"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { OrderItemInput } from "./use-create-order";

export interface UpdateOrderPayload {
  customer_id: string | null;
  customer_name: string;
  customer_address_id: string | null;
  delivery_type: "delivery" | "pickup";
  delivery_fee: number;
  payment_method: "cash" | "transfer";
  discount_type: "amount" | "percentage" | "none" | null;
  discount_value: number;
  discount_amount: number;
  items: OrderItemInput[];
  notes: string | null;
  delivery_time?: string | null;
}

export function useUpdateOrder() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      payload,
    }: {
      orderId: string;
      payload: UpdateOrderPayload;
    }) => {
      // 1️⃣ Eliminar order_item_extras de los items viejos
      const { data: oldItems } = await supabase
        .from("order_items")
        .select("id")
        .eq("order_id", orderId);

      if (oldItems && oldItems.length > 0) {
        const oldItemIds = oldItems.map((item) => item.id);
        await supabase
          .from("order_item_extras")
          .delete()
          .in("order_item_id", oldItemIds);
      }

      // 2️⃣ Eliminar order_items viejos
      await supabase.from("order_items").delete().eq("order_id", orderId);

      // 3️⃣ Calcular nuevo total
      const totalAmount = payload.items.reduce((sum, item) => {
        const extrasTotal = item.extras.reduce(
          (extSum, ext) => extSum + ext.subtotal,
          0,
        );
        return sum + item.subtotal + extrasTotal;
      }, 0);

      const finalTotal =
        totalAmount - payload.discount_amount + payload.delivery_fee;

      // 4️⃣ Actualizar order
      const { data: updatedOrder, error: orderError } = await supabase
        .from("orders")
        .update({
          customer_id: payload.customer_id,
          customer_name: payload.customer_name,
          customer_address_id: payload.customer_address_id,
          delivery_type: payload.delivery_type,
          delivery_fee: payload.delivery_fee,
          payment_method: payload.payment_method,
          delivery_time: payload.delivery_time ?? null,
          discount_type: payload.discount_type,
          discount_value: payload.discount_value,
          discount_amount: payload.discount_amount,
          total_amount: finalTotal,
          notes: payload.notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .select()
        .single();

      if (orderError) throw orderError;

      // 5️⃣ Insertar nuevos order_items
      const itemsToInsert = payload.items.map((item) => ({
        order_id: orderId,
        burger_id: item.burger_id,
        combo_id: item.combo_id ?? null,
        extra_id: item.extra_id ?? null, // 🆕
        burger_name: item.burger_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        customizations: item.customizations ?? null,
      }));

      const { data: insertedItems, error: itemsError } = await supabase
        .from("order_items")
        .insert(itemsToInsert)
        .select();

      if (itemsError) throw itemsError;

      // 6️⃣ Insertar order_item_extras
      const extrasToInsert: any[] = [];

      payload.items.forEach((item, index) => {
        const orderItemId = insertedItems?.[index]?.id;
        if (!orderItemId) return;

        item.extras.forEach((extra) => {
          extrasToInsert.push({
            order_item_id: orderItemId,
            extra_id: extra.extra_id,
            extra_name: extra.extra_name,
            quantity: extra.quantity,
            unit_price: extra.unit_price,
            subtotal: extra.subtotal,
          });
        });
      });

      if (extrasToInsert.length > 0) {
        const { error: extrasError } = await supabase
          .from("order_item_extras")
          .insert(extrasToInsert);

        if (extrasError) throw extrasError;
      }

      return updatedOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders-history"] });
      queryClient.invalidateQueries({ queryKey: ["order-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["today-orders-count"] });
    },
    onError: (error) => {
      console.error("❌ Error actualizando pedido:", error);
    },
  });
}