import type { OrderStatus } from "@/lib/types";

export const orderStatusConfig: Record<
  OrderStatus,
  {
    label: string;
    className: string;
  }
> = {
  new: {
    label: "Nuevo",
    className: "bg-blue-500 text-white",
  },
  paid: {
    label: "Pagado",
    className: "bg-yellow-500 text-white",
  },
  ready: {
    label: "Listo",
    className: "bg-green-500 text-white",
  },
  completed: {
    label: "Completado",
    className: "bg-green-700 text-white",
  },
  canceled: {
    label: "Cancelado",
    className: "bg-red-500 text-white",
  },
};
