-- ============================================================
-- Dishflow — Phase 1: generic products/variant_groups/variant_options (010)
-- ============================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- Phase 1 of a multi-phase genericization refactor (SQL-only). It introduces
-- `products` + `variant_groups` + `variant_options` as the future generic
-- menu model, backfills them from the CURRENT `burgers`/`extras` tables, and
-- keeps the app running unchanged by renaming the old tables to
-- `*_legacy` and re-creating `burgers`/`extras` as compatibility views over
-- `products`. No TypeScript/React code is touched or needs to change for
-- this phase — Phase 2 is what migrates hooks/pages onto the new tables
-- directly. Until then, the app keeps reading/writing `burgers`/`extras` as
-- if nothing happened.
--
-- THIS HAS NOT BEEN RUN AGAINST ANY LIVE DATABASE
-- -------------------------------------------------
-- No Supabase credentials were available in this session, so nothing here
-- has been executed or verified against a real Postgres instance. Before
-- touching a real deployment:
--   1. Apply this to a throwaway/dev clone of the database first.
--   2. Manually validate every `.select("...")` / `.insert(...)` /
--      `.update(...)` call site in lib/hooks/use-menu.ts and
--      lib/hooks/use-menu-crud.ts (and any other file querying
--      `burgers`/`extras` directly — see the "call sites audited" list
--      below) still behaves identically against the compat views.
--   3. Pay special attention to the FK-repoint step near the bottom — it
--      changes what `order_items.burger_id` / `order_items.extra_id` /
--      `order_item_extras.extra_id` physically reference. This is required
--      for PostgREST embedded-resource selects to keep working (see the
--      big comment block before that section) — skipping it will silently
--      break lib/hooks/orders/use-orders-history.ts's `useProductStats`.
--
-- Ground truth used for column shapes: scripts/000-baseline-schema.sql
-- (the reconstructed TRUE live schema). scripts/001-create-schema.sql is
-- stale and was NOT consulted for shapes — only for historical contrast.
--
-- REVERSIBILITY
-- --------------
-- `burgers_legacy` / `extras_legacy` are kept, not dropped. To roll back:
--   1. Repoint order_items/order_item_extras FKs back to *_legacy (reverse
--      of the FK-repoint section below).
--   2. DROP VIEW burgers, extras; DROP TRIGGER ... (the INSTEAD OF triggers
--      go with their views).
--   3. ALTER TABLE burgers_legacy RENAME TO burgers;
--      ALTER TABLE extras_legacy RENAME TO extras;
--   4. DROP TABLE variant_options, variant_groups, products;
--
-- CALL SITES AUDITED (grep for `.from("burgers")` / `.from("extras")` across
-- the whole repo, not just the two hooks named in the task):
--   - lib/hooks/use-menu.ts               → useBurgers/useExtras, `select("*")`
--   - lib/hooks/use-menu-crud.ts           → useAllBurgers/useCreateBurger/
--     useUpdateBurger/useDeleteBurger/useAllExtras/useCreateExtra/
--     useUpdateExtra/useDeleteExtra — full CRUD via `.from("burgers"/"extras")`
--   - lib/hooks/orders/use-orders-history.ts:408 → `.from("burgers").select(
--     "id, name, image_url")` (plain select, no embed)
--   - lib/hooks/orders/use-orders-history.ts:484 → `.from("order_items")
--     .select("...burgers(default_meat_quantity, default_fries_quantity),
--     extras(category), order_item_extras(quantity, extras(category))")`
--     — a PostgREST EMBEDDED join through FK relationships. THIS is the one
--     that requires the FK-repoint section below; see its comment.
-- No other `.from("burgers")` / `.from("extras")` call sites exist in the
-- repo (order-for-edit.ts's `extras:order_item_extras(*)` is just an alias
-- name for an order_item_extras embed, unrelated to the `extras` table).
--
-- ============================================================

-- ============================================================
-- 1. New generic tables
-- ============================================================

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  -- categories is vestigial/unused by the running app today (see
  -- 000-baseline-schema.sql's own finding) — nullable so no product is ever
  -- forced to have one.
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  base_price DECIMAL(10, 2) NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  image_url TEXT,
  ingredients TEXT[] DEFAULT '{}',
  is_addon BOOLEAN NOT NULL DEFAULT FALSE,
  -- Preserves the original extras.category value ('extra'/'drink'/'fries'/
  -- 'sides') for rows migrated from `extras`, since that's still how the
  -- compat view and today's UI (extrasByCategory grouping, variantGroupLabels
  -- in lib/verticals/burger.ts) group things. NULL for burger-derived rows.
  legacy_extra_category TEXT,
  -- ASSUMPTION / DELIBERATE TRADEOFF: the task's base shape for `products`
  -- does not include default_meat_quantity/default_fries_quantity — the
  -- "correct" generic design would reconstruct them from the "Medallones"/
  -- "Papas" variant groups' default option. That requires the burgers compat
  -- view to join against variant_groups/variant_options, which risks turning
  -- it into a non-updatable view (joins break Postgres's automatic
  -- updatable-view eligibility), and use-menu-crud.ts's useCreateBurger /
  -- useUpdateBurger both read/write these two columns directly. The
  -- lower-risk choice: keep them as real, plain columns on `products` too,
  -- copied verbatim from `burgers` during migration. The `burgers` compat
  -- view then stays a trivial single-table passthrough (guaranteed
  -- updatable), and Phase 3 can migrate callers off these columns onto the
  -- variant-group-derived values once the wizard actually reads variant
  -- groups instead. NULL for is_addon = true (extras-derived) rows, since
  -- the concept doesn't apply to them.
  default_meat_quantity SMALLINT,
  default_fries_quantity NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE variant_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable (not just "FK to products") to allow future shared/template
  -- groups not tied to one product — not used by this migration's backfill,
  -- but reserved per the task's shape.
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  selection TEXT NOT NULL DEFAULT 'single' CHECK (selection IN ('single', 'multi')),
  is_required BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE variant_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_group_id UUID NOT NULL REFERENCES variant_groups(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  price_delta DECIMAL(10, 2) NOT NULL DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_is_addon ON products(is_addon);
CREATE INDEX idx_variant_groups_product_id ON variant_groups(product_id);
CREATE INDEX idx_variant_options_variant_group_id ON variant_options(variant_group_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_options ENABLE ROW LEVEL SECURITY;

-- Same "allow all" internal-dashboard posture as every other table
-- (see 000-baseline-schema.sql).
CREATE POLICY "Allow all operations on products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on variant_groups" ON variant_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on variant_options" ON variant_options FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 2. Backfill products from the OLD burgers/extras tables
-- ============================================================
-- Runs BEFORE the rename in section 3 — `burgers`/`extras` here still refer
-- to the original tables.

-- Every burger → a non-addon product, id preserved so order_items.burger_id
-- keeps resolving to the same row (see FK-repoint section below for why the
-- FK itself also needs to move).
INSERT INTO products (
  id, name, description, category_id, base_price, is_available, image_url,
  ingredients, is_addon, legacy_extra_category, default_meat_quantity,
  default_fries_quantity, created_at
)
SELECT
  id, name, description, NULL, base_price, is_available, image_url,
  ingredients, FALSE, NULL, default_meat_quantity, default_fries_quantity,
  created_at
FROM burgers;

-- Every extra → an addon product, id preserved for order_items.extra_id /
-- order_item_extras.extra_id continuity.
INSERT INTO products (
  id, name, description, category_id, base_price, is_available, image_url,
  ingredients, is_addon, legacy_extra_category, default_meat_quantity,
  default_fries_quantity, created_at
)
SELECT
  id, name, NULL, NULL, price, is_available, NULL,
  '{}', TRUE, category, NULL, NULL, created_at
FROM extras;

-- ------------------------------------------------------------
-- 2a. "Medallones" variant group per migrated burger
-- ------------------------------------------------------------
-- Formula source: components/order-wizard/hooks/use-burger-selection.ts,
-- updateMeatCount (lines ~61-77):
--   const newMeatCount = Math.max(1, b.meatCount + delta);
--   const meatDiff = newMeatCount - (b.burger.default_meat_quantity ?? 2);
--   const meatPriceAdjustment = meatExtra ? meatDiff * meatExtra.price : 0;
-- i.e. price_delta(n) = (n - default_meat_quantity) * meatExtra.price.
-- Cross-checked identically in components/order-wizard/services/
-- order-price-calculator.ts and order-data-transformer.ts.
--
-- `meatExtra` is resolved in components/order-wizard/order-wizard-drawer.tsx
-- (line ~60) via `extras.find(e => e.name === "Medallón")` — an exact,
-- case-sensitive string match. If no such row exists (true today for a
-- fresh dev DB seeded only from scripts/002-seed-data.sql — it seeds no
-- "Medallón" extra), meatExtra is undefined in the app and the entire meat
-- stepper UI is hidden (`{meatExtra && (...)}` in burger-item-card.tsx). We
-- deliberately do NOT fabricate a "Medallones" variant group with a
-- price_delta of 0 in that case — that would assert a real per-unit price
-- that doesn't exist. The group/options are only created when a real
-- "Medallón" extra row is present to derive the multiplier from.
--
-- Range: the UI enforces only a floor (`Math.max(1, ...)`, and
-- burger-item-card.tsx disables the decrement button at meatCount <= 1) —
-- no ceiling exists anywhere in the code. We generate options 1..4 by
-- default (covering the named "Simple"/"Doble"/"Triple" labels used by
-- getMeatLabel() plus one more), but widen the upper bound per-burger via
-- GREATEST(4, default_meat_quantity + 1) so the invariant "the row matching
-- default_meat_quantity is always present and is_default" holds even for a
-- hypothetical burger whose default_meat_quantity was set above 3. This is
-- a judgment call flagged for a later phase to revisit against real usage
-- data (e.g. does any burger actually get ordered with 5+ patties?).
WITH meat_extra AS (
  SELECT price FROM extras WHERE name = 'Medallón' LIMIT 1
),
inserted_meat_groups AS (
  INSERT INTO variant_groups (id, product_id, label, selection, is_required, sort_order)
  SELECT gen_random_uuid(), b.id, 'Medallones', 'single', TRUE, 0
  FROM burgers b
  WHERE EXISTS (SELECT 1 FROM meat_extra)
  RETURNING id AS group_id, product_id AS burger_id
)
INSERT INTO variant_options (id, variant_group_id, label, price_delta, is_default, sort_order)
SELECT
  gen_random_uuid(),
  g.group_id,
  CASE n
    WHEN 1 THEN 'Simple'
    WHEN 2 THEN 'Doble'
    WHEN 3 THEN 'Triple'
    ELSE n || ' carnes'
  END,
  (n - b.default_meat_quantity) * me.price,
  (n = b.default_meat_quantity),
  n
FROM inserted_meat_groups g
JOIN burgers b ON b.id = g.burger_id
CROSS JOIN meat_extra me
CROSS JOIN generate_series(1, GREATEST(4, b.default_meat_quantity + 1)) AS n;

-- ------------------------------------------------------------
-- 2b. "Papas" (fries quantity) variant group per migrated burger
-- ------------------------------------------------------------
-- Verified this genuinely parallels the meat pattern (not guessed) by
-- reading both components/order-wizard/services/order-price-calculator.ts
-- (calculateBurgersTotal) and order-data-transformer.ts
-- (transformBurgersToOrderItems):
--   const baseFries = item.burger.default_fries_quantity ?? 1;
--   const friesDiff = item.friesQuantity - baseFries;
--   friesTotal = friesDiff * friesExtra.price * item.quantity;
-- i.e. price_delta(n) = (n - default_fries_quantity) * friesExtra.price —
-- structurally identical to meat (diff * unit price), just gated on a
-- different reference extra and reference column.
--
-- friesExtra is resolved in order-wizard-drawer.tsx (line ~65) via
-- `extras.find(e => e.name === "Papas fritas chicas")`. Same as meat: if
-- that extra doesn't exist (true for a fresh 002-seed-data.sql DB), the
-- fries stepper is hidden and we do not fabricate this group either.
--
-- NOTE (inconsistency spotted, not ours to fix): components/orders/
-- burger-item-card.tsx filters extras by `e.name !== "Papas Fritas Chicas"`
-- (different casing) when rendering the standalone-extras badge list. That
-- filter and the pricing lookup in order-wizard-drawer.tsx use different
-- casing for the same conceptual extra — a pre-existing bug in the app,
-- unrelated to this migration, flagged here for visibility.
--
-- Range: floor of 0 is enforced (`disabled={item.friesQuantity <= 0}` in
-- burger-item-card.tsx), no ceiling in code. We generate 0..3, widened via
-- GREATEST(3, default_fries_quantity + 1) for the same is_default-must-exist
-- reason as meat. Also a judgment call — flagged for later revisit.
WITH fries_extra AS (
  SELECT price FROM extras WHERE name = 'Papas fritas chicas' LIMIT 1
),
inserted_fries_groups AS (
  INSERT INTO variant_groups (id, product_id, label, selection, is_required, sort_order)
  SELECT gen_random_uuid(), b.id, 'Papas', 'single', TRUE, 1
  FROM burgers b
  WHERE EXISTS (SELECT 1 FROM fries_extra)
  RETURNING id AS group_id, product_id AS burger_id
)
INSERT INTO variant_options (id, variant_group_id, label, price_delta, is_default, sort_order)
SELECT
  gen_random_uuid(),
  g.group_id,
  CASE n
    WHEN 0 THEN 'Sin papas'
    WHEN 1 THEN '1 porción'
    ELSE n || ' porciones'
  END,
  (n - b.default_fries_quantity) * fe.price,
  (n = b.default_fries_quantity),
  n
FROM inserted_fries_groups g
JOIN burgers b ON b.id = g.burger_id
CROSS JOIN fries_extra fe
CROSS JOIN generate_series(0, GREATEST(3, CEIL(b.default_fries_quantity) + 1)::int) AS n;

-- ------------------------------------------------------------
-- 2c. Veggie substitution — explicitly NOT modeled here
-- ------------------------------------------------------------
-- lib/hooks/use-burger-selection.ts detects veggie purely by name:
--   isVeggie: /veggie/i.test(burger.name)
-- There is no dedicated "veggie" column/flag/product anywhere in the DB —
-- a "veggie burger" is just a `burgers` row whose name happens to match
-- that regex, i.e. today it is a distinct PRODUCT ROW, not a selectable
-- variant option on some other product. Section 2's plain burgers→products
-- copy already carries such a row over as-is (same id, same name), which is
-- the correct and only thing to do at the DATA layer. Modeling "veggie" as
-- a variant option (e.g. a patty-type choice on a single burger product)
-- would require the WIZARD to change how it offers veggie (Phase 3), not a
-- migration of existing rows — there is no existing data shape to migrate
-- from, since it isn't data-driven today. Deliberately left untouched.

-- ============================================================
-- 3. Rename old tables, create compat views
-- ============================================================

ALTER TABLE burgers RENAME TO burgers_legacy;
ALTER TABLE extras RENAME TO extras_legacy;

-- Simple, single-table, unfiltered-except-by-is_addon SELECT — this stays
-- within Postgres's "automatically updatable view" rules (no joins,
-- aggregates, DISTINCT, etc.), so plain UPDATE/DELETE through this view
-- work with no extra plumbing. Column list/order chosen to match the
-- Burger interface in lib/types/index.ts and every `.select("*")` call
-- site in lib/hooks/use-menu.ts / use-menu-crud.ts.
CREATE VIEW burgers AS
SELECT
  id, name, description, base_price, ingredients, is_available, image_url,
  default_meat_quantity, default_fries_quantity, created_at
FROM products
WHERE is_addon = FALSE;

CREATE VIEW extras AS
SELECT
  id, name, legacy_extra_category AS category, base_price AS price,
  is_available, created_at
FROM products
WHERE is_addon = TRUE;

-- ------------------------------------------------------------
-- 3a. INSERT support — why a plain updatable view is NOT enough
-- ------------------------------------------------------------
-- BLOCKING ISSUE IDENTIFIED (flagging per the task's instruction rather than
-- silently shipping something that breaks at runtime):
--
-- Postgres's automatic view-updatability only lets INSERT set values for
-- columns actually exposed by the view. `is_addon` is not exposed by either
-- view (deliberately — exposing it would add a field to Extra/Burger that
-- lib/types/index.ts doesn't declare, breaking the "exact same shape"
-- requirement). Without it in the view's column list, an INSERT through a
-- view falls back to `products.is_addon`'s column DEFAULT (FALSE) for every
-- row, regardless of which view you inserted through.
--
-- For the `burgers` view this happens to be harmless (is_addon = FALSE is
-- exactly what a burger needs) — but for the `extras` view it is NOT: an
-- INSERT via `.from("extras").insert(...)` (lib/hooks/use-menu-crud.ts,
-- useCreateExtra) would silently create a row with is_addon = FALSE. That
-- row would then satisfy the `burgers` view's WHERE clause instead of the
-- `extras` view's, meaning the newly-created "extra" would vanish from
-- useAllExtras()/useExtras() and incorrectly show up as a burger. No error
-- is raised — it fails silently at the data level. This is exactly the kind
-- of gap the task said to flag loudly rather than paper over.
--
-- Fix: INSTEAD OF INSERT triggers on both views that construct the
-- underlying products row explicitly (hardcoding the correct is_addon for
-- that view) instead of relying on the table's column default. Added to
-- BOTH views for symmetry/documentation, even though the `burgers` one is
-- technically redundant with today's column default — this makes the
-- is_addon assignment explicit and independent of a future change to that
-- column's default value.
--
-- UPDATE and DELETE through both views do NOT need triggers: neither
-- Burger nor Extra ever carries an `is_addon`-equivalent field, so
-- UPDATE/DELETE via the plain updatable view path (Postgres folds the
-- view's WHERE clause into the underlying UPDATE/DELETE automatically)
-- behaves correctly with no extra plumbing.

CREATE OR REPLACE FUNCTION burgers_view_insert() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO products (
    id, name, description, base_price, ingredients, is_available, image_url,
    default_meat_quantity, default_fries_quantity, is_addon,
    legacy_extra_category, created_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), NEW.name, NEW.description,
    NEW.base_price, COALESCE(NEW.ingredients, '{}'),
    COALESCE(NEW.is_available, TRUE), NEW.image_url,
    COALESCE(NEW.default_meat_quantity, 2),
    COALESCE(NEW.default_fries_quantity, 1),
    FALSE, NULL, COALESCE(NEW.created_at, NOW())
  )
  RETURNING
    id, name, description, base_price, ingredients, is_available, image_url,
    default_meat_quantity, default_fries_quantity, created_at
  INTO
    NEW.id, NEW.name, NEW.description, NEW.base_price, NEW.ingredients,
    NEW.is_available, NEW.image_url, NEW.default_meat_quantity,
    NEW.default_fries_quantity, NEW.created_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER burgers_view_insert_trigger
INSTEAD OF INSERT ON burgers
FOR EACH ROW EXECUTE FUNCTION burgers_view_insert();

CREATE OR REPLACE FUNCTION extras_view_insert() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO products (
    id, name, base_price, legacy_extra_category, is_available, is_addon,
    created_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), NEW.name, NEW.price, NEW.category,
    COALESCE(NEW.is_available, TRUE), TRUE, COALESCE(NEW.created_at, NOW())
  )
  RETURNING id, name, legacy_extra_category, base_price, is_available, created_at
  INTO NEW.id, NEW.name, NEW.category, NEW.price, NEW.is_available, NEW.created_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER extras_view_insert_trigger
INSTEAD OF INSERT ON extras
FOR EACH ROW EXECUTE FUNCTION extras_view_insert();

-- ============================================================
-- 4. FK repoint: order_items / order_item_extras → products
-- ============================================================
-- BLOCKING ISSUE IDENTIFIED — this section exists solely because of one
-- call site: lib/hooks/orders/use-orders-history.ts:484
--   .from("order_items").select(
--     "quantity, burger_id, extra_id, combo_id, customizations, " +
--     "burgers(default_meat_quantity, default_fries_quantity), " +
--     "extras(category), order_item_extras(quantity, extras(category))"
--   )
-- This is a PostgREST EMBEDDED join, resolved purely from real FK
-- constraints (plus, for views, PostgREST's pg_depend-based tracing of
-- which base table a view is a simple projection of).
--
-- If we only rename burgers/extras to *_legacy and stop there:
--   - order_items.burger_id's FK constraint still points at burgers_legacy
--     (renaming a table does not move its incoming FKs — they follow the
--     table's OID, not its name).
--   - The new `burgers` VIEW is a projection of `products`, not of
--     `burgers_legacy`.
--   - PostgREST has no FK connecting order_items to `products`, so it
--     cannot resolve an embed literally named `burgers(...)` at all — the
--     request would fail with a "could not find a relationship between
--     order_items and burgers" schema-cache error.
--
-- Fix: repoint order_items.burger_id, order_items.extra_id, and
-- order_item_extras.extra_id to reference `products(id)` directly. Because
-- section 2 preserved the original UUIDs when migrating burgers/extras rows
-- into products, every existing order_items/order_item_extras row still
-- resolves correctly — no data loss, no row needs updating, only the
-- constraint's target table changes. Once the FK targets `products`,
-- PostgREST can trace the `burgers`/`extras` views back to `products` via
-- pg_depend and resolve the embed by view name exactly as before.
--
-- The original schema (000-baseline-schema.sql) was reconstructed, not
-- introspected, so we don't have confirmed real constraint names. Rather
-- than assume Postgres's default `<table>_<column>_fkey` naming holds live,
-- each block below looks up whatever the actual FK constraint name is for
-- that column and drops it dynamically, then adds an explicitly-named
-- replacement.

DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO con_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
   AND kcu.table_schema = tc.table_schema
  WHERE tc.table_name = 'order_items'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'burger_id'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE order_items DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_burger_id_fkey
  FOREIGN KEY (burger_id) REFERENCES products(id);

DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO con_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
   AND kcu.table_schema = tc.table_schema
  WHERE tc.table_name = 'order_items'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'extra_id'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE order_items DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_extra_id_fkey
  FOREIGN KEY (extra_id) REFERENCES products(id);

DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO con_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
   AND kcu.table_schema = tc.table_schema
  WHERE tc.table_name = 'order_item_extras'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'extra_id'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE order_item_extras DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE order_item_extras
  ADD CONSTRAINT order_item_extras_extra_id_fkey
  FOREIGN KEY (extra_id) REFERENCES products(id);

-- After this, burgers_legacy/extras_legacy have no incoming FKs at all —
-- they are inert historical copies only, safe to drop in a later phase
-- once Phase 2/3/4 no longer need them for comparison/rollback.
