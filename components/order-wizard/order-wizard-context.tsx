"use client";

import { createContext, useContext } from "react";
import type { Customer, Burger, Extra } from "@/lib/types";

export type WizardStep = "customer" | "burgers" | "summary";

export interface SelectedBurger {
  burger: Burger;
  quantity: number;
  meatCount: number;
  meatPriceAdjustment: number;
  removedIngredients: string[];
  selectedExtras: { extra: Extra; quantity: number }[];
}

export interface OrderWizardState {
  step: WizardStep;
  selectedCustomer: Customer | null;
  selectedAddress?: string;
  selectedBurgers: SelectedBurger[];
  notes: string;
  deliveryType: "pickup" | "delivery";
  deliveryFee: number;
}

export const OrderWizardContext = createContext<ReturnType<
  typeof useOrderWizard
> | null>(null);

export const useOrderWizardContext = () => {
  const ctx = useContext(OrderWizardContext);
  if (!ctx) throw new Error("OrderWizardProvider missing");
  return ctx;
};
