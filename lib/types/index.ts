// ============================================
// BASE TYPES - Directamente de la DB
// ============================================

export type OrderStatus = "new" | "ready" | "completed" | "canceled"; // ❌ Eliminar "paid" (no está en DB)
export type ExtraCategory = "extra" | "drink" | "fries" | "sides";
export type DeliveryType = "pickup" | "delivery";
export type PaymentMethod = "cash" | "transfer";
export type DiscountType = "amount" | "percentage" | "none";

// ============================================
// CUSTOMER
// ============================================

export interface Customer {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  created_at: string;
}

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string;
  address: string | null;
  is_default: boolean;
  notes: string | null;
  created_at: string;
}

// ============================================
// BURGERS
// ============================================

export interface Burger {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  ingredients: string[];
  is_available: boolean;
  image_url: string | null;
  default_meat_quantity: number; // Viene de DB como smallint
  default_fries_quantity: number; // Viene de DB como numeric
  created_at: string;
}

// ============================================
// EXTRAS
// ============================================

export interface Extra {
  id: string;
  name: string;
  category: ExtraCategory;
  price: number;
  is_available: boolean;
  created_at: string;
}

// ============================================
// PRODUCTS (generic products/variant_groups/variant_options — Phase 2,
// see scripts/010-generic-products.sql). `burgers`/`extras` above stay as
// the shapes exposed by the compat VIEWS the order wizard still reads;
// these are the shapes of the underlying `products` table the admin pages
// now read/write directly.
// ============================================

export type VariantSelection = "single" | "multi";

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  base_price: number;
  is_available: boolean;
  image_url: string | null;
  ingredients: string[];
  is_addon: boolean;
  // NULL for burger-derived (is_addon = false) rows. Preserves the old
  // extras.category value for addon rows — see 010-generic-products.sql §1.
  legacy_extra_category: ExtraCategory | null;
  // NULL for addon rows — see 010-generic-products.sql §1 for why these
  // stayed plain columns instead of being derived from variant groups.
  default_meat_quantity: number | null;
  default_fries_quantity: number | null;
  created_at: string;
}

export interface VariantGroup {
  id: string;
  product_id: string | null;
  label: string;
  selection: VariantSelection;
  is_required: boolean;
  sort_order: number;
  created_at: string;
}

export interface VariantOption {
  id: string;
  variant_group_id: string;
  label: string;
  price_delta: number;
  is_default: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface VariantGroupWithOptions extends VariantGroup {
  variant_options: VariantOption[];
}

export interface ProductWithVariantGroups extends Product {
  variant_groups: VariantGroupWithOptions[];
}

// ============================================
// VARIANT SELECTIONS (frozen price snapshot — Phase 3, see
// scripts/020-order-items-variant-selections.sql). One entry per selected
// variant option on an order_item, with price_delta COPIED from
// variant_options.price_delta at order-creation time so a later edit to the
// live variant_options row never re-prices an already-placed order.
// ============================================

export interface VariantSelectionEntry {
  variant_group_id: string;
  variant_group_label: string;
  variant_option_id: string;
  variant_option_label: string;
  price_delta: number;
}

// ============================================
// ORDERS
// ============================================

export interface Order {
  id: string;
  order_number: number;
  customer_id: string | null;
  customer_name: string;
  customer?: { phone: string | null; customer_addresses?: CustomerAddress[] } | null;
  customer_address_id: string | null; // 🆕 Agregado de DB
  status: OrderStatus;
  is_paid: boolean;
  total_amount: number;
  delivery_type: DeliveryType; // 🆕 Agregado de DB
  delivery_fee: number; // 🆕 Agregado de DB
  payment_method: PaymentMethod; // 🆕 Agregado de DB
  delivery_time: string | null; // 🆕 AGREGAR
  discount_type: DiscountType | null; // 🆕 Agregado de DB
  discount_value: number; // 🆕 Agregado de DB
  discount_amount: number; // 🆕 Agregado de DB
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Phase 4 (scripts/030-order-items-cutover.sql): what an order_item's
// product_id/combo_id mean is now an explicit discriminator instead of the
// old "exactly one of burger_id/extra_id/combo_id is set" convention that
// was only ever enforced in application code.
export type OrderItemKind = "product" | "combo" | "addon";

export interface OrderItem {
  id: string;
  order_id: string;
  // Phase 4: replaces burger_id/extra_id — both already pointed at
  // products(id) after Phase 1's FK repoint (scripts/010-generic-
  // products.sql), so this is a same-target rename, not a re-pointing.
  // Null when kind === "combo".
  product_id: string | null;
  kind: OrderItemKind;
  combo_id: string | null; // 🆕 Agregado de DB — untouched by Phase 4, combos are Phase 5's job
  // Generic per-line-item display name (burger, combo, or side name — see
  // scripts/030-order-items-cutover.sql's "WHY burger_name IS KEPT" note
  // for why this was NOT renamed to name_snapshot despite the DB
  // genericization: too many readers across the app still use this exact
  // name for non-burger items).
  burger_name: string;
  // Phase 4: additive frozen copy of burger_name at creation time, written
  // going forward by lib/hooks/orders/use-create-order.ts /
  // use-update-order.ts. Null on rows created before Phase 4 shipped.
  name_snapshot: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  customizations: string | null;
  // Phase 3 (scripts/020-order-items-variant-selections.sql): additive
  // column, so it's absent/null on every order_item row created before
  // Phase 3 shipped. See services/order-data-loader.ts's loadBurgers for
  // how the null case falls back to the pre-Phase-3 behavior.
  variant_selections?: VariantSelectionEntry[] | null;
  created_at: string;
}

// Phase 4: renamed from OrderItemExtra to match the order_item_modifiers
// table rename (scripts/030-order-items-cutover.sql) — extra_id/extra_name
// -> product_id/name_snapshot.
export interface OrderItemModifier {
  id: string;
  order_item_id: string;
  product_id: string;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
}

// ============================================
// EXTENDED TYPES - Con relaciones
// ============================================

export interface OrderItemWithExtras extends OrderItem {
  extras: OrderItemModifier[];
}

export interface OrderWithItems extends Order {
  customer?: { phone: string | null } | null;
  customer_address?: CustomerAddress | null; // Nombre consistente con DB
  items: OrderItemWithExtras[];
}

// ============================================
// EXTERNAL INCOME
// ============================================

export interface ExternalIncome {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  description: string | null;
  created_at: string;
}

// ============================================
// FRONTEND TYPES - Para el wizard
// ============================================

export type WizardStep = "customer" | "burgers" | "summary";

export interface OrderItemDraft {
  id: string;
  burger: Burger;
  quantity: number;
  meatCount: number;
  meatPriceAdjustment: number;
  removedIngredients: string[];
  selectedExtras: { extra: Extra; quantity: number }[];
}
