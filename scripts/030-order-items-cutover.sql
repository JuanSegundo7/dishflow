-- ============================================================
-- Dishflow — Phase 4: order_items cutover onto the generic product
-- model (030)
-- ============================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- Phase 4 is the deepest cutover of the products genericization refactor
-- (see scripts/010-generic-products.sql for Phase 1 and
-- scripts/020-order-items-variant-selections.sql for Phase 3). It finalizes
-- `order_items` / `order_item_extras` onto the generic `products` model:
--
--   1. order_items gains `product_id` (replaces burger_id/extra_id — both
--      already pointed at `products(id)` after Phase 1's FK repoint, so this
--      is a same-target rename, not a re-pointing), `kind` (a real
--      discriminator column, replacing the "exactly one of burger_id/
--      extra_id/combo_id is set" convention that was only ever enforced in
--      application code — see 000-baseline-schema.sql's own note flagging
--      this), and `name_snapshot` (additive frozen-name companion column;
--      see the "WHY burger_name IS KEPT" note below for why it does NOT
--      replace `burger_name`).
--   2. order_item_extras is renamed to order_item_modifiers, with
--      extra_id -> product_id and extra_name -> name_snapshot, matching the
--      generic vocabulary used everywhere else in this refactor (products/
--      variant_groups/variant_options, not burgers/extras).
--
-- combo_id is explicitly NOT touched — combos remain their own concept
-- (combos/combo_slots/combo_slots_rules tables, untouched by this
-- migration). Generalizing combo internals onto the product model is
-- Phase 5's job, not this one's — see the app-code audit performed
-- alongside this migration (order-data-transformer.ts/order-price-
-- calculator.ts's calculateCombosTotal/transformCombosToOrderItems keep
-- their existing meatExtra/friesExtra-based combo pricing unchanged).
--
-- WHY burger_name IS KEPT (not dropped, despite name_snapshot existing)
-- ------------------------------------------------------------------------
-- The task framing for this migration allowed either "drop burger_name once
-- name_snapshot fully replaces it" OR "keep both if any reader still needs
-- the old name — check call sites first, don't guess." We checked: unlike
-- extra_name (whose only readers are the small, contained set of places
-- that render "extras added on top of an item" — order-details-modal.tsx,
-- formatOrderWhatsapp.ts, order-data-transformer.ts), `burger_name` is read
-- as the GENERIC per-line-item display name across a large swath of the
-- app — burger items, combo items, and side items all reuse this one
-- column for their name (see components/order-wizard/services/
-- order-data-transformer.ts writing `burger_name: c.combo.name` for combos
-- and `burger_name: s.extra.name` for sides; services/order-data-loader.ts,
-- order-details-modal.tsx, formatOrderWhatsapp.ts, and use-orders-history.ts's
-- useTopBurgers all read it the same generic way). Renaming every one of
-- those call sites purely to satisfy a naming preference, with zero
-- behavior change and real risk to the order flow, was judged not worth it
-- for this phase. `name_snapshot` is added as the going-forward generic
-- name (mirroring order_item_modifiers.name_snapshot for symmetry) and is
-- populated identically to burger_name at insert time by
-- lib/hooks/orders/use-create-order.ts / use-update-order.ts from this
-- point forward, but nothing is migrated OFF burger_name in this phase.
-- Flagging this as a deliberate, conservative judgment call rather than a
-- half-finished rename.
--
-- THIS HAS NOT BEEN RUN AGAINST ANY LIVE DATABASE
-- -------------------------------------------------
-- Same caveat as every prior migration in this refactor: no Supabase
-- credentials were available in this session, so nothing here has been
-- executed or verified against a real Postgres instance. Apply to a
-- throwaway/dev clone first, and diff its result against
-- scripts/000-baseline-schema.sql's reconstructed shape before trusting it.
--
-- REVERSIBILITY
-- --------------
-- This migration DROPS columns (burger_id, extra_id) and RENAMES a table
-- (order_item_extras -> order_item_modifiers), which are not free to undo —
-- unlike Phase 1/3's purely additive changes. To roll back:
--   1. ALTER TABLE order_item_modifiers RENAME TO order_item_extras;
--      ALTER TABLE order_item_extras RENAME COLUMN product_id TO extra_id;
--      ALTER TABLE order_item_extras RENAME COLUMN name_snapshot TO extra_name;
--   2. ALTER TABLE order_items ADD COLUMN burger_id UUID REFERENCES products(id);
--      ALTER TABLE order_items ADD COLUMN extra_id UUID REFERENCES products(id);
--      UPDATE order_items SET burger_id = product_id WHERE kind = 'product';
--      UPDATE order_items SET extra_id = product_id WHERE kind = 'addon';
--   3. ALTER TABLE order_items DROP COLUMN product_id, DROP COLUMN kind,
--      DROP COLUMN name_snapshot;
-- Note step 2 can only reconstruct burger_id/extra_id for rows whose kind
-- is still 'product'/'addon' — this is a lossless inverse of THIS
-- migration's own backfill (section 2 below), not a magical undo of
-- anything upstream.
--
-- CALL SITES AUDITED (whole-repo grep for burger_id/extra_id "on order_items"
-- and order_item_extras/extra_name, per this phase's mandatory safety gate —
-- see the accompanying task report for the full list). Every real consumer
-- found was migrated in the same pass as this migration:
--   - components/order-wizard/services/order-data-transformer.ts
--   - lib/hooks/orders/use-create-order.ts
--   - lib/hooks/orders/use-update-order.ts
--   - lib/hooks/orders/use-orders.ts
--   - lib/hooks/orders/use-orders-history.ts
--   - lib/hooks/orders/use-order-for-edit.ts
--   - services/order-data-loader.ts
--   - components/orders/order-details-modal.tsx
--   - lib/types/index.ts
-- order-wizard-drawer.OLD.tsx and components/order-wizard/components/*.tsx
-- are confirmed orphaned/unimported (per Phase 3's own audit) and were left
-- untouched. lib/utils/formatOrderWhatsapp.ts reads `order.order_items`/
-- `item.extra_id`/`item.order_item_extras` off a pre-existing, unrelated
-- typing bug (the `Order` type has no `order_items` field — real orders
-- from that call path only ever have `.items`/`.extras`; see that file's
-- own pre-existing tsc errors, uncatalogued before this phase and not
-- created by it) — `item` resolves to `any` there, so this rename does not
-- change its (already broken) behavior, and per this phase's brief we are
-- not doing a general cleanup of that file.
--
-- ============================================================

-- ============================================================
-- 1. order_items: additive columns first
-- ============================================================

ALTER TABLE order_items ADD COLUMN product_id UUID REFERENCES products(id);
ALTER TABLE order_items ADD COLUMN kind TEXT NOT NULL DEFAULT 'product'
  CHECK (kind IN ('product', 'combo', 'addon'));
ALTER TABLE order_items ADD COLUMN name_snapshot TEXT;

-- ============================================================
-- 2. Backfill from the old burger_id/extra_id/burger_name columns
-- ============================================================

UPDATE order_items
SET
  product_id = COALESCE(burger_id, extra_id),
  kind = CASE
    WHEN combo_id IS NOT NULL THEN 'combo'
    WHEN burger_id IS NOT NULL THEN 'product'
    WHEN extra_id IS NOT NULL THEN 'addon'
    ELSE 'product'
  END,
  name_snapshot = burger_name;

-- ============================================================
-- 3. Drop the now-redundant burger_id/extra_id columns
-- ============================================================
-- Their data is fully absorbed into product_id + kind (backfilled above).
-- Dropping a column also drops any constraint defined solely on it (its FK
-- to products, added in scripts/010-generic-products.sql's FK-repoint
-- section), so no separate constraint-drop step is needed here.
--
-- burger_name is INTENTIONALLY NOT dropped — see the "WHY burger_name IS
-- KEPT" note at the top of this file. combo_id is INTENTIONALLY NOT
-- touched — combos stay their own concept for this phase.

ALTER TABLE order_items DROP COLUMN burger_id;
ALTER TABLE order_items DROP COLUMN extra_id;

-- ============================================================
-- 4. Rename order_item_extras -> order_item_modifiers
-- ============================================================
-- extra_id already references products(id) directly (Phase 1's FK
-- repoint), so renaming the column preserves that FK's target unchanged —
-- only the table/column names change, no data moves.

ALTER TABLE order_item_extras RENAME TO order_item_modifiers;
ALTER TABLE order_item_modifiers RENAME COLUMN extra_id TO product_id;
ALTER TABLE order_item_modifiers RENAME COLUMN extra_name TO name_snapshot;

-- Rename the constraint/index inherited from the old table name for
-- clarity (purely cosmetic — Postgres does not require this for the
-- rename above to work; the FK and index kept functioning under their old
-- names throughout steps above).
ALTER TABLE order_item_modifiers
  RENAME CONSTRAINT order_item_extras_extra_id_fkey TO order_item_modifiers_product_id_fkey;

-- ============================================================
-- 5. Indexes
-- ============================================================

-- New index for the column that replaces burger_id/extra_id as the
-- lookup key into products.
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- The old extra_id index no longer applies (column dropped); the old
-- combo_id index is untouched (combo_id itself is untouched).
DROP INDEX IF EXISTS idx_order_items_extra_id;

-- Rename the inherited order_item_extras index for the same cosmetic-
-- clarity reason as the constraint rename above.
ALTER INDEX IF EXISTS idx_order_item_extras_order_item_id
  RENAME TO idx_order_item_modifiers_order_item_id;

-- idx_order_items_order_id, idx_order_items_combo_id are untouched — see
-- scripts/000-baseline-schema.sql / scripts/010-generic-products.sql.
