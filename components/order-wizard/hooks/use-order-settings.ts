import { DeliveryType, DiscountType, PaymentMethod } from "@/lib/types";
import { useState } from "react";

function getDefaultDeliveryTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

const DEFAULT_DELIVERY_FEE_KEY = "restaurant_default_delivery_fee";

function getDefaultDeliveryFee(): number {
  if (typeof window === "undefined") return 2000;
  const stored = localStorage.getItem(DEFAULT_DELIVERY_FEE_KEY);
  return stored ? Number(stored) : 2000;
}

export function useOrderSettings() {
  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">(
    "pickup",
  );
  const [deliveryFee, setDeliveryFee] = useState(getDefaultDeliveryFee);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">(
    "cash",
  );
  const [notes, setNotes] = useState("");
  const [discountType, setDiscountType] = useState<
    "amount" | "percentage" | "none"
  >("none");
  const [discountValue, setDiscountValue] = useState(0);
  const [deliveryTime, setDeliveryTime] = useState(getDefaultDeliveryTime);

  const reset = () => {
    setDeliveryType("delivery");
    setDeliveryFee(getDefaultDeliveryFee());
    setPaymentMethod("transfer");
    setDiscountType("none");
    setDiscountValue(0);
    setNotes("");
    setDeliveryTime(getDefaultDeliveryTime()); // recalcula al momento del reset
  };

  const loadSettings = (settings: {
    deliveryType: DeliveryType;
    deliveryFee: number;
    paymentMethod: PaymentMethod;
    discountType: DiscountType;
    discountValue: number;
    notes: string;
    deliveryTime?: string;
  }) => {
    setDeliveryType(settings.deliveryType);
    setDeliveryFee(settings.deliveryFee);
    setPaymentMethod(settings.paymentMethod);
    setDiscountType(settings.discountType);
    setDiscountValue(settings.discountValue);
    setNotes(settings.notes);
    setDeliveryTime(settings.deliveryTime || "");
  };

  return {
    deliveryType,
    setDeliveryType,
    deliveryFee,
    setDeliveryFee,
    paymentMethod,
    setPaymentMethod,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    notes,
    setNotes,
    deliveryTime,
    setDeliveryTime,
    reset,
    loadSettings,
  };
}