import type { OrderItemInput } from "@/lib/hooks/orders/use-create-order";

/**
 * Shared contract for the order wizard's vertical-specific "core item
 * selection" step — the step where the customer picks and customizes the
 * vertical's main sellable products (burger building for
 * orderFlow: "builder-wizard", sushi piece-count picking for
 * orderFlow: "piece-selector" — see lib/verticals/types.ts's OrderFlow).
 * order-wizard-drawer.tsx picks exactly one flow's STEP COMPONENT to render
 * based on useVertical().orderFlow instead of hardcoding BurgersStep (see
 * that file's "items" step render block); this interface is the
 * corresponding CONTROLLER-level contract that lets use-order-wizard.ts
 * read totals/order-items generically without caring which flow is active.
 *
 * Deliberately NOT a shared React component prop signature: burger's rich
 * per-item customization UI (meat count, fries, ingredients, extras — see
 * BurgersStepProps in steps/burgers-step.tsx) and sushi's simpler
 * per-product piece-count + quantity UI (see SushiStepProps in
 * steps/sushi-step.tsx) have genuinely different interaction models.
 * Forcing one prop shape onto both would produce a lowest-common-
 * denominator surface neither implementation actually needs. Each flow
 * keeps its own selection hook (useBurgerSelection / useSushiSelection)
 * and step component (BurgersStep / SushiStep) with their own full,
 * flow-specific shapes; this interface only wraps the handful of things
 * use-order-wizard.ts needs GENERICALLY, via one small adapter object built
 * from each hook's state (see burgerFlowAdapter/sushiFlowAdapter in
 * use-order-wizard.ts).
 *
 * NOTE on `total`: this is each flow's OWN contribution to the subtotal,
 * not routed through OrderPriceCalculator.calculateSubtotal's existing
 * `selectedBurgers` argument for the burger flow — that argument/call path
 * is left completely untouched to guarantee the burger vertical's pricing
 * math is a byte-for-byte no-op. Only the sushi flow's total is threaded in
 * as the new `additionalTotal` param on calculateSubtotal/calculateOrderTotal.
 */
export interface OrderFlowAdapter {
  /**
   * Whether the wizard may advance past this step. Both current
   * implementations set this to `true` unconditionally — mirrors today's
   * pre-existing (unenforced) `canProceedFromBurgers` in use-order-wizard.ts
   * and the burger step's "Siguiente" button, which has never had a
   * `disabled` condition. Kept in the contract (rather than omitted) so a
   * future flow that DOES need to require a selection before proceeding
   * doesn't need a breaking interface change later. Not currently wired
   * into order-wizard-drawer.tsx's "Siguiente" button for either flow —
   * deliberately, to avoid changing the burger step's existing permissive
   * behavior.
   */
  canProceed: boolean;
  /** This flow's contribution to the order subtotal (already scaled by quantity). */
  total: number;
  /** This flow's line items, transformed to the backend-facing OrderItemInput[] shape. */
  toOrderItems: () => OrderItemInput[];
}
