import { formatCurrency } from "@/lib/utils/format";
import type { Order } from "@/lib/types";

const PICKUP_ADDRESS = "Dirección de retiro pendiente de configurar";

export function formatOrderForDelivery(order: Order) {
  const isDelivery = order.delivery_type === "delivery";

  const address = order.customer?.customer_addresses?.find(
    (a) => a.id === order.customer_address_id,
  );

  const deliveryFee = order.delivery_fee;

  const entrega = isDelivery ? (address?.address ?? "-") : "Retira en local";
  const phone = order.customer?.phone ?? "-";

  return `*RESTAURANTE*
Nombre Del Cliente: ${order.customer_name}
📍 Retiro: ${PICKUP_ADDRESS}
📍 Entrega: ${entrega}
💵 Pagar al local: $
💸 Cobrar al cliente: $
🛵 Envío: ${formatCurrency(deliveryFee)}
🧭 Estado Del Pedido
📱 Tel cliente: ${phone}`.trim();
}
