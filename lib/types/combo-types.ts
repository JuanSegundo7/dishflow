// ============================================
// COMBO TYPES - Basados en la estructura de DB
// ============================================

import { Burger, Extra, VariantSelectionEntry } from ".";

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
  /**
   * Phase 3 (generic variant-selection model, see
   * lib/utils/variant-pricing.ts): the "Papas" (fries quantity) counterpart
   * to meatPriceAdjustment, sourced from the burger's "Papas" variant
   * group's price_delta instead of a magic-string extras lookup. Optional
   * because combo-slot burgers (use-combo-selection.ts / the loadCombos
   * branch of services/order-data-loader.ts) don't populate it — combos
   * keep using their own inline meat/fries formula unchanged until Phase 5
   * generalizes them too.
   */
  friesPriceAdjustment?: number;
  /**
   * Phase 3 frozen price snapshot for this line item — see
   * scripts/020-order-items-variant-selections.sql. Holds the resolved
   * Medallones/Papas variant_option selections (group + option ids/labels
   * plus the price_delta that was actually charged). Populated whenever
   * meatCount/friesQuantity are set through the current variant-group-aware
   * code path (addBurger/updateMeatCount/updateFriesQuantity in
   * use-burger-selection.ts), or reconstructed verbatim from
   * order_items.variant_selections when editing an order created after
   * this phase shipped. Left undefined for combo-slot burgers and for
   * burgers loaded from a pre-Phase-3 order that has no stored snapshot
   * (see the fallback branch of loadBurgers in
   * services/order-data-loader.ts) — those cases intentionally do NOT get
   * price freezing retroactively.
   */
  variantSelections?: VariantSelectionEntry[];
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
