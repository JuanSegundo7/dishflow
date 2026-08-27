-- ============================================================
-- Dishflow — Cost/Stock/Finance porting, PR2: order source + commission
-- (043)
-- ============================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- First migration of PR2 (see scripts/042-product-supplies.sql for PR1's
-- last one). Purely additive columns on two existing tables:
--
--   1. `orders.source` — which sales channel an order came from (e.g.
--      "PedidosYa", "Rappi", "Mostrador"). Nullable, NO CHECK constraint —
--      unlike `orders.status`/`orders.delivery_type` above (fixed,
--      code-branched enums), channel names are user-configured data (see
--      lib/utils/commission.ts's getOrderSources()/saveOrderSources(),
--      persisted to localStorage, not a DB table in this PR) that an
--      operator can rename/add/remove at any time — a CHECK enum here would
--      have to be kept in lock-step with that localStorage list, which
--      defeats the point of it being operator-configurable.
--   2. `orders.commission_rate` / `orders.commission_amount` — the
--      commission percentage and computed amount for that order's source,
--      FROZEN at order-creation time (see lib/hooks/orders/use-create-order.ts
--      /use-update-order.ts) so a later edit to a source's configured rate
--      never re-prices an already-placed order — same "freeze at creation,
--      never re-derive from live config" pattern
--      scripts/020-order-items-variant-selections.sql already established
--      for variant_selections.price_delta.
--   3. `orders.price_adjustment` — reserved for PR3 (a later PR in this
--      stacked chain, out of scope here). Added now, alongside the other
--      order-level additive columns in this same migration, purely so PR3
--      doesn't need its own migration for a single column. NOT wired into
--      any UI or calculation in this PR — every row's value stays at the
--      column default until PR3 wires it up.
--   4. `external_income.source` — same channel concept as orders.source,
--      for manually-logged external income entries. Also NOT wired into any
--      UI in this PR (PR3's job) — added now for the same "avoid a
--      single-column migration later" reasoning as price_adjustment above.
--
-- WHY commission_rate/commission_amount ARE NOT NULL DEFAULT 0 (not
-- nullable)
-- -------------------------------------------------------------------------
-- Every pre-existing order (and every future order with no configured
-- commission for its source, or no source at all) has no commission to
-- speak of — 0 is the correct, unambiguous value, not "unknown" (which
-- NULL would imply, forcing every downstream SUM()/display to COALESCE).
-- Same reasoning `discount_amount`/`delivery_fee` already use on this same
-- table (scripts/000-baseline-schema.sql).
--
-- THIS HAS NOT BEEN RUN AGAINST ANY LIVE DATABASE
-- -------------------------------------------------
-- Same caveat as every prior migration in this repo. Apply to a
-- throwaway/dev clone first.
--
-- REVERSIBILITY
-- --------------
-- Additive only. To roll back:
--   DROP INDEX idx_orders_source;
--   ALTER TABLE orders DROP COLUMN source, DROP COLUMN commission_rate,
--     DROP COLUMN commission_amount, DROP COLUMN price_adjustment;
--   ALTER TABLE external_income DROP COLUMN source;
--
-- ============================================================

-- ============================================================
-- 1. orders — source + commission + reserved price_adjustment
-- ============================================================

ALTER TABLE orders
  ADD COLUMN source TEXT,
  ADD COLUMN commission_rate NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN commission_amount NUMERIC NOT NULL DEFAULT 0,
  -- Reserved for PR3 — see header note 3 above. Not wired into any
  -- UI/calculation in this PR.
  ADD COLUMN price_adjustment NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX idx_orders_source ON orders(source);

-- ============================================================
-- 2. external_income — source (not wired into UI in this PR — see PR3)
-- ============================================================

ALTER TABLE external_income
  ADD COLUMN source TEXT;
