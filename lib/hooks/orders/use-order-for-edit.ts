import { useQuery } from "@tanstack/react-query";
import type { OrderWithItems } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

/**
 * Hook para cargar un pedido completo con todos sus items y extras
 * Útil para editar un pedido existente
 */
export function useOrderForEdit(orderId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["order-for-edit", orderId],
    queryFn: async () => {
      if (!orderId) return null;

      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          customerAddress:customer_addresses(*),
          items:order_items(
            *,
            extras:order_item_extras(*)
          )
        `,
        )
        .eq("id", orderId)
        .single();

      if (error) throw error;

      return data as OrderWithItems;
    },
    enabled: !!orderId, // Solo ejecutar si hay orderId
    staleTime: 0, // Siempre refetch para tener datos frescos
  });
}
