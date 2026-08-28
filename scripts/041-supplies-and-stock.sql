-- ============================================================
-- Dishflow — Cost/Stock/Finance porting, PR1: supplies + stock (041)
-- ============================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- First migration of the "porting-cost-stock-finance" change. Introduces
-- `supplies` — the raw-ingredient inventory model (flour, cheese, oil,
-- etc.) that recipes (scripts/042-product-supplies.sql, PR1's second
-- migration, same PR) will reference to compute a product's cost. This file
-- ONLY creates the table — no other table is touched, no backfill runs
-- (there is no legacy "supplies" concept anywhere in the app to migrate
-- from), and nothing here is wired into a product's cost yet. That wiring
-- (product_supplies) is scripts/042, a separate migration in this same PR
-- so this one can be reviewed/applied independently if needed.
--
-- DELIBERATE DESIGN CHOICES (called out per this refactor's own convention
-- of flagging judgment calls instead of burying them in the DDL):
--   - cost_per_unit is DECIMAL(10, 4), not DECIMAL(10, 2) like
--     products.base_price (scripts/010-generic-products.sql). Per-gram/
--     per-ml costs are routinely sub-cent (e.g. $0.0350/g of a $35/kg
--     ingredient) — 2 decimal places would round that to $0.04/g, a >14%
--     error compounded across every recipe line. 4 decimals keeps that
--     rounding error negligible at the unit-cost level; the final computed
--     product cost (lib/services/recipe-cost.ts) still gets rounded/
--     formatted for display the same way prices are everywhere else.
--   - stock_quantity and min_stock_quantity have NO CHECK constraint and
--     are NOT clamped to >= 0. This is intentional, not an oversight:
--     negative stock is a valid, meaningful state for this feature (e.g. a
--     manual count correction runs behind on entering purchases, or a
--     recipe was consumed before its restock was logged) and the low-stock
--     banner (components/supplies/low-stock-banner.tsx) is purely
--     informational — it warns, it never blocks a save or a sale. Enforcing
--     a floor here would fight that design on the one layer (the DB) that's
--     hardest to override later. See low-stock-banner.tsx / supply-form-
--     dialog.tsx for the two places that would otherwise be tempted to clamp
--     this and were deliberately left un-clamped.
--   - unit is a closed CHECK enum (g/kg/ml/l/unit) rather than a free-text
--     column or its own lookup table — five units cover everything a
--     recipe realistically needs for this phase, and a closed set keeps
--     lib/services/recipe-cost.ts's math simple (no unit-conversion logic
--     is introduced here; a supply's cost_per_unit/stock_quantity are
--     always expressed in that same supply's own `unit`, never converted
--     across units). A future phase can revisit if a real need for
--     free-form units or cross-unit conversion appears.
--
-- THIS HAS NOT BEEN RUN AGAINST ANY LIVE DATABASE
-- -------------------------------------------------
-- Same caveat as every prior migration in this repo (see
-- scripts/010-generic-products.sql and later files) — no Supabase
-- credentials were available in this session. Apply to a throwaway/dev
-- clone first.
--
-- REVERSIBILITY
-- --------------
-- Purely additive — a single new table, nothing else touched. To roll back:
--   DROP TABLE supplies;
-- (only safe before scripts/042-product-supplies.sql is applied, since that
-- migration adds a `product_supplies.supply_id` FK referencing this table
-- with ON DELETE RESTRICT — see that file's own header).
--
-- ============================================================

CREATE TABLE supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('g', 'kg', 'ml', 'l', 'unit')),
  -- See "DELIBERATE DESIGN CHOICES" above for why this is (10, 4) and not
  -- (10, 2) like products.base_price.
  cost_per_unit DECIMAL(10, 4) NOT NULL DEFAULT 0,
  -- No CHECK constraint, deliberately — see "DELIBERATE DESIGN CHOICES"
  -- above. Negative stock is an allowed, meaningful state.
  stock_quantity NUMERIC NOT NULL DEFAULT 0,
  min_stock_quantity NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mirrors idx_products_is_addon (scripts/010-generic-products.sql) — the
-- supplies list/picker UI filters on is_active the same way admin product
-- lists filter on is_addon.
CREATE INDEX idx_supplies_is_active ON supplies(is_active);

ALTER TABLE supplies ENABLE ROW LEVEL SECURITY;

-- Same "allow all" internal-dashboard posture as every other table in this
-- repo (see scripts/000-baseline-schema.sql / scripts/010-generic-
-- products.sql) — this is a single-tenant admin dashboard, not a
-- multi-tenant app with row-level ownership.
CREATE POLICY "Allow all operations on supplies" ON supplies FOR ALL USING (true) WITH CHECK (true);
