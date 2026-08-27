/**
 * Cost/stock/finance porting, PR2 — order source + commission config.
 *
 * Order sources (sales channels, e.g. "PedidosYa", "Rappi", "Mostrador")
 * are operator-configured data, not a fixed code-branching enum (see
 * scripts/043-order-source-and-commission.sql's header for why
 * `orders.source` has no CHECK constraint). Mirrors the existing
 * `restaurant_default_delivery_fee` localStorage convention (see
 * components/order-wizard/hooks/use-order-settings.ts) rather than
 * introducing a different persistence pattern for equally-simple
 * operator-editable config.
 */

export interface OrderSourceConfig {
  key: string;
  label: string;
  commissionRate: number;
}

const ORDER_SOURCES_KEY = "restaurant_order_sources";

export function getOrderSources(): OrderSourceConfig[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(ORDER_SOURCES_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOrderSources(sources: OrderSourceConfig[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ORDER_SOURCES_KEY, JSON.stringify(sources));
}

/**
 * Pure — computes the commission amount for a given items subtotal and
 * rate. `rate` is a percentage (e.g. 10 means 10%), matching how
 * `discountValue`/`OrderPriceCalculator.calculateDiscountAmount` already
 * express percentage-type values elsewhere in the wizard. Rounds to 2
 * decimals, same precision every other money value in this app is
 * formatted/persisted at.
 */
export function computeCommission(subtotalItems: number, rate: number): number {
  const safeSubtotal = Number(subtotalItems) || 0;
  const safeRate = Number(rate) || 0;
  if (safeRate <= 0 || safeSubtotal <= 0) return 0;
  const raw = (safeSubtotal * safeRate) / 100;
  return Math.round(raw * 100) / 100;
}
