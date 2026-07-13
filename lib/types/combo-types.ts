// ============================================
// COMBO TYPES - Basados en la estructura de DB
// ============================================

import { Burger, Extra } from ".";

export interface Combo {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
  created_at: string;
}

export interface ComboSlotRule {
  id: number;
  combo_slot_id: string;
  rule_type: string | null;
  rule_value: string | null;
  created_at: string;
}

export interface ComboSlot {
  id: string;
  combo_id: string;
  slot_type: string; // "burger" | "drink" | "side" | "nuggets" (cualquier string en DB)
  quantity: number;
  required: boolean;
  default_meat_quantity: number | null;
  created_at: string;
}

export interface ComboSnapshot {
  id: string;
  name: string;
  price: number;
  description?: string | null;
  is_available?: boolean;
  created_at?: string;
  slots?: ComboSlotWithRules[];
}

// ============================================
// EXTENDED TYPES - Para uso en el frontend
// ============================================

export interface ComboSlotWithRules extends ComboSlot {
  rules: {
    min_quantity: number;
    max_quantity: number;
    allowed_meat_count?: number[];
    no_fries?: boolean;
  };
}

export interface ComboWithSlots extends Combo {
  slots: ComboSlotWithRules[];
}

// ============================================
// HELPER TYPES
// ============================================

// Tipos literales para slot_type (los que realmente usamos)
export type ComboSlotType = "burger" | "drink" | "side";

// Type guard para verificar slot_type
export function isValidSlotType(type: string): type is ComboSlotType {
  return ["burger", "drink", "side", "nuggets"].includes(type);
}

export interface SelectedBurger {
  id: string;
  burger: Burger;
  quantity: number;
  meatCount: number;
  friesQuantity: number;
  referenceFriesQuantity?: number; // Override para combos sin papas: evita descuento al calcular precio
  isVeggie?: boolean; // true = medallones veggies en lugar de carne
  removedIngredients: string[];
  selectedExtras: Array<{
    extra: Extra;
    quantity: number;
  }>;
  meatPriceAdjustment: number;
}

/**
 * SelectedComboSlot - TIPO COMPARTIDO
 * Representa un slot dentro de un combo seleccionado
 */
export interface SelectedComboSlot {
  slotId: string;
  slotType: "burger" | "drink" | "side";
  defaultMeatCount?: number;
  maxQuantity: number;
  minQuantity: number;
  rules: {
    min_quantity: number;
    max_quantity: number;
    allowed_meat_count?: number[];
  };
  burgers: SelectedBurger[];
  selectedExtras: Extra[];
}

/**
 * SelectedCombo - TIPO COMPARTIDO
 * Representa un combo completo seleccionado en el wizard
 */
export interface SelectedCombo {
  id: string;
  combo: ComboWithSlots | ComboSnapshot; // 🆕 Acepta ambos
  quantity: number;
  slots: SelectedComboSlot[];
}

interface CreateComboSlotPayload {
  slot_type: string;
  quantity: number;
  default_meat_quantity?: number | null;
  rules?: Array<{
    rule_type: string | null;
    rule_value: string | null;
  }>;
}

export interface CreateComboPayload {
  name: string;
  price: number;
  is_available: boolean;
  slots: CreateComboSlotPayload[];
}
