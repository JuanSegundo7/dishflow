"use client";

import { Order } from "@/lib/types";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { OrderCard } from "./order-card";
import { OrderCardMobile } from "./order-card-mobile";
export function SortableOrderCard({
  order,
  onViewDetails,
  onEditOrder, // 🆕
  onChangeStatus,
}: {
  order: Order;
  onViewDetails: (order: Order) => void;
  onEditOrder?: (order: Order) => void; // 🆕
  onChangeStatus?: (order: Order) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: order.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? transition : undefined,
  };

  return (
    <>
      {/* 📱 MOBILE (sin drag) */}
      <div className="lg:hidden">
        <OrderCardMobile
          order={order}
          onViewDetails={onViewDetails}
          onEditOrder={onEditOrder} // 🆕
          onChangeStatus={onChangeStatus}
        />
      </div>

      {/* 💻 DESKTOP (con drag) */}
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="hidden lg:block"
      >
        <OrderCard
          order={order}
          onViewDetails={onViewDetails}
          isDragging={isDragging}
          visualStatus={order.status}
          onEditOrder={onEditOrder} // 🆕
          onChangeStatus={onChangeStatus}
        />
      </div>
    </>
  );
}
