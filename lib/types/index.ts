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

export interface OrderItem {
  id: string;
  order_id: string;
  burger_id: string | null; // 🆕 Puede ser null (si es combo)
  combo_id: string | null; // 🆕 Agregado de DB
  burger_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  customizations: string | null;
  created_at: string;
}

export interface OrderItemExtra {
  id: string;
  order_item_id: string;
  extra_id: string;
  extra_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
}

// ============================================
// EXTENDED TYPES - Con relaciones
// ============================================

export interface OrderItemWithExtras extends OrderItem {
  extras: OrderItemExtra[];
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
