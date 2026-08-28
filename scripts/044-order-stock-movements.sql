-- ============================================================
-- Dishflow — Cost/Stock/Finance porting, PR4: order stock movements (044)
-- ============================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- First (and only) migration of PR4 (Group 7a — Automatic Stock Deduction).
-- Introduces `order_stock_movements` — the append-only ledger of raw-supply
-- stock actually decremented for a completed order, written/read by
-- lib/hooks/supplies/use-order-stock-sync.ts. Depends on `supplies`
-- (scripts/041-supplies-and-stock.sql) and `product_supplies`
-- (scripts/042-product-supplies.sql), both already applied in earlier PRs
-- of this same stacked chain.
--
-- WHY (order_id, supply_id) IS THE UNIQUE KEY, NOT order_item_id
-- -------------------------------------------------------------------------
-- lib/hooks/orders/use-update-order.ts deletes and re-inserts EVERY
-- order_items row on every edit (see that file's steps 1-2). An
-- order_item-scoped ledger would be silently orphaned by the
-- order_items -> order_stock_movements relationship on every single edit,
-- even edits that don't change quantities. Keying by (order_id, supply_id)
-- instead means the ledger survives an edit's delete+reinsert cycle
-- untouched unless the edit path explicitly reverses/reapplies it (see
-- use-update-order.ts's R2 guard, PR4 task 7a.8) — the ledger answers "how
-- much of supply X has this ORDER consumed", not "how much did this
-- specific line item consume", which is exactly what stock deduction and
-- its reversal need.
--
-- WHY THE UNIQUE CONSTRAINT ITSELF IS THE IDEMPOTENCY GUARD
-- -------------------------------------------------------------------------
-- Per this PR's spec: idempotency is driven by this ledger existing for a
-- given (order_id, supply_id), NEVER by orders.status alone — a retried
-- "mark completed" (double-click, network retry) must be a hard no-op. The
-- UNIQUE(order_id, supply_id) constraint below is what makes a second
-- attempt to insert the same movement row fail loudly (23505) instead of
-- silently duplicating — see use-order-stock-sync.ts's applyStockDeduction
-- for how that failure is turned into a safe no-op rather than an error
-- surfaced to the UI.
--
-- NO SEPARATE order_id INDEX
-- -------------------------------------------------------------------------
-- The UNIQUE(order_id, supply_id) constraint already creates a composite
-- btree index leading with order_id — every query in
-- use-order-stock-sync.ts filters by order_id alone (e.g. the reverse
-- path's "SELECT movements for order"), which that index already serves
-- efficiently. A second single-column index on order_id would be
-- redundant.
--
-- THIS HAS NOT BEEN RUN AGAINST ANY LIVE DATABASE
-- -------------------------------------------------
-- Same caveat as every prior migration in this repo. Apply to a
-- throwaway/dev clone first.
--
-- REVERSIBILITY
-- --------------
-- Purely additive — a single new table, nothing else touched. To roll back:
--   DROP TABLE order_stock_movements;
--
-- ============================================================

CREATE TABLE order_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- RESTRICT, matching product_supplies.supply_id (scripts/042-product-
  -- supplies.sql) — a supply that already has ledger history must not be
  -- silently deletable; deactivate it instead (supplies.is_active = false).
  supply_id UUID NOT NULL REFERENCES supplies(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- THE idempotency guard — see "WHY THE UNIQUE CONSTRAINT ITSELF IS THE
  -- IDEMPOTENCY GUARD" above.
  UNIQUE (order_id, supply_id)
);

ALTER TABLE order_stock_movements ENABLE ROW LEVEL SECURITY;

-- Same "allow all" internal-dashboard posture as every other table in this
-- repo (see scripts/000-baseline-schema.sql / scripts/041-supplies-and-
-- stock.sql) — this is a single-tenant admin dashboard, not a multi-tenant
-- app with row-level ownership.
CREATE POLICY "Allow all operations on order_stock_movements" ON order_stock_movements FOR ALL USING (true) WITH CHECK (true);
