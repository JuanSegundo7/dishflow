-- ============================================================
-- Dishflow — Phase 6: seed a clone from a VerticalDefinition (040)
-- ============================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- Proves the "clone Dishflow, seed a DIFFERENT vertical" workflow actually
-- works at the DATA level, using lib/verticals/sushi.ts's `sushiVertical`
-- as the concrete example. It is deliberately written against the GENERAL
-- shape every `VerticalDefinition.seedTemplate` declares (see
-- lib/verticals/types.ts's `VerticalSeedTemplate`/`SeedCategory`/
-- `SeedVariantGroup`/`SeedVariantOption`):
--   - `seedTemplate.categories`  -> menu category buckets
--   - `seedTemplate.variantGroups` -> addon variant groups (extra/drink/
--     fries/sides) PLUS any product-specific variant group template (here,
--     sushi's "Piezas" 4/8-piece group)
-- i.e. the STRUCTURE below (products + variant_groups + variant_options,
-- addon products keyed by legacy_extra_category) is vertical-agnostic and
-- would look the same for a future pizzaVertical/panaderiaVertical seed
-- file — only the concrete names/prices are sushi-specific, since there is
-- no live DB in this session to genuinely template this dynamically (e.g.
-- via a small Node/ts-node script that reads `sushiVertical.seedTemplate`
-- and generates INSERTs). That dynamic version is a reasonable follow-up
-- once a real sushi clone needs re-seeding more than once; hardcoding it
-- concretely here is the lower-risk, provable-today choice for this phase.
--
-- Schema assumed: post scripts/031-drop-legacy-compat.sql (products/
-- variant_groups/variant_options are the ONLY menu tables — no burgers/
-- extras compat views exist anymore). Apply 000 through 031 first, then
-- this file, against a fresh Supabase project for the new clone.
--
-- WHY `categories` IS NOT SEEDED HERE
-- ------------------------------------
-- `VerticalSeedTemplate.categories` (see sushiVertical.seedTemplate in
-- lib/verticals/sushi.ts) documents category buckets per the
-- `SeedCategory` shape, but this script deliberately does NOT insert rows
-- into the real `categories` table:
--   1. scripts/000-baseline-schema.sql already found `categories` to be
--      vestigial — "no `supabase.from("categories")` call exists anywhere
--      in the current app code" — and that remains true; `products.
--      category_id` is nullable and unused by any live query. Seeding a
--      table nothing reads would be pure noise.
--   2. `categories.type` carries a CHECK constraint inherited from the
--      original burger-only schema: `CHECK (type IN ('burger', 'extra',
--      'drink', 'fries'))` (scripts/000-baseline-schema.sql). sushi's real
--      category types ("roll", "sides") don't fit that enum — inserting
--      would either violate the CHECK or require widening it, which is a
--      schema change out of scope for this phase (this file only adds
--      data, per the task's scope discipline). Flagging this here rather
--      than silently working around it: the fixed CHECK enum is the same
--      kind of "burger-shaped assumption baked into a generic-looking
--      table" as `VariantGroupLabels`'s fixed 4 slots (see sushi.ts's
--      top-of-file comment) — both are real friction for a 3rd vertical,
--      not fixed by this phase.
-- `products.category_id` is simply left NULL below, exactly like burger
-- rows already are (scripts/002-seed-data.sql never populates it either).
--
-- THIS HAS NOT BEEN RUN AGAINST ANY LIVE DATABASE
-- -------------------------------------------------
-- No Supabase credentials were available in this session. Before running
-- against a real deployment:
--   1. Apply to a throwaway/dev clone first.
--   2. Confirm scripts/000 through 031 have already been applied (this
--      script assumes `products`/`variant_groups`/`variant_options` exist
--      and `burgers`/`extras` compat views do NOT).
--   3. Sanity-check price_delta values against the target market's real
--      pricing — the numbers below are placeholders, not researched menu
--      prices.
--
-- REVERSIBILITY
-- --------------
-- Every row inserted here is brand new (fresh gen_random_uuid()s, no
-- existing data touched or repointed). To roll back:
--   DELETE FROM products WHERE name IN (
--     'California Roll', 'Philadelphia Roll', 'Sushi Veggie Roll',
--     'Salsa de Soja', 'Salsa Agridulce', 'Gaseosa Cola', 'Agua Mineral',
--     'Edamame', 'Gyozas', 'Wasabi Extra', 'Jengibre Extra'
--   );
-- `variant_groups`/`variant_options` for the deleted products cascade via
-- their `ON DELETE CASCADE` FKs (see scripts/010-generic-products.sql) — no
-- separate cleanup needed for those two tables.
--
-- ============================================================

-- ============================================================
-- 1. Sample rolls (non-addon products) + their "Piezas" variant group
-- ============================================================
-- Mirrors sushiVertical.seedTemplate.variantGroups's "piezas" entry
-- (lib/verticals/sushi.ts): a single-selection, required group per roll,
-- with "4 piezas" as the default (price_delta 0 — base_price already
-- covers 4 pieces) and "8 piezas" at a positive delta. `metadata` carries
-- the raw piece count as structured data (not just parsed from the label)
-- so a future adapter/UI can read `variant_options.metadata->>'pieces'`
-- directly — see components/order-wizard/adapters/sushi-piece-selector.tsx,
-- which reads it exactly this way.

WITH roll_1 AS (
  INSERT INTO products (name, description, base_price, ingredients, is_addon, is_available)
  VALUES (
    'California Roll',
    'Palta, kanikama y pepino, enrollado en arroz y sésamo',
    3500.00,
    ARRAY['palta', 'kanikama', 'pepino', 'arroz', 'sésamo', 'nori'],
    FALSE,
    TRUE
  )
  RETURNING id
),
roll_1_group AS (
  INSERT INTO variant_groups (product_id, label, selection, is_required, sort_order)
  SELECT id, 'Piezas', 'single', TRUE, 0 FROM roll_1
  RETURNING id, product_id
)
INSERT INTO variant_options (variant_group_id, label, price_delta, is_default, sort_order, metadata)
SELECT id, '4 piezas', 0, TRUE, 0, '{"pieces": 4}'::jsonb FROM roll_1_group
UNION ALL
SELECT id, '8 piezas', 2800.00, FALSE, 1, '{"pieces": 8}'::jsonb FROM roll_1_group;

WITH roll_2 AS (
  INSERT INTO products (name, description, base_price, ingredients, is_addon, is_available)
  VALUES (
    'Philadelphia Roll',
    'Salmón, queso crema y ciboulette, enrollado en arroz y sésamo',
    4200.00,
    ARRAY['salmón', 'queso crema', 'ciboulette', 'arroz', 'sésamo', 'nori'],
    FALSE,
    TRUE
  )
  RETURNING id
),
roll_2_group AS (
  INSERT INTO variant_groups (product_id, label, selection, is_required, sort_order)
  SELECT id, 'Piezas', 'single', TRUE, 0 FROM roll_2
  RETURNING id, product_id
)
INSERT INTO variant_options (variant_group_id, label, price_delta, is_default, sort_order, metadata)
SELECT id, '4 piezas', 0, TRUE, 0, '{"pieces": 4}'::jsonb FROM roll_2_group
UNION ALL
SELECT id, '8 piezas', 3200.00, FALSE, 1, '{"pieces": 8}'::jsonb FROM roll_2_group;

WITH roll_3 AS (
  INSERT INTO products (name, description, base_price, ingredients, is_addon, is_available)
  VALUES (
    'Sushi Veggie Roll',
    'Palta, pepino y zanahoria, enrollado en arroz y sésamo',
    3000.00,
    ARRAY['palta', 'pepino', 'zanahoria', 'arroz', 'sésamo', 'nori'],
    FALSE,
    TRUE
  )
  RETURNING id
),
roll_3_group AS (
  INSERT INTO variant_groups (product_id, label, selection, is_required, sort_order)
  SELECT id, 'Piezas', 'single', TRUE, 0 FROM roll_3
  RETURNING id, product_id
)
INSERT INTO variant_options (variant_group_id, label, price_delta, is_default, sort_order, metadata)
SELECT id, '4 piezas', 0, TRUE, 0, '{"pieces": 4}'::jsonb FROM roll_3_group
UNION ALL
SELECT id, '8 piezas', 2400.00, FALSE, 1, '{"pieces": 8}'::jsonb FROM roll_3_group;

-- ============================================================
-- 2. Sample addon products, one per sushiVertical.labels.variantGroupLabels
--    slot (extra/drink/fries/sides — see the "forced fit" comment at the
--    top of lib/verticals/sushi.ts for why these 4 fixed keys carry
--    sushi-specific labels: Salsas/Bebidas/Acompañamientos/Extras)
-- ============================================================

INSERT INTO products (name, base_price, is_addon, legacy_extra_category, is_available) VALUES
  ('Salsa de Soja',    300.00, TRUE, 'extra', TRUE),
  ('Salsa Agridulce',  350.00, TRUE, 'extra', TRUE),
  ('Gaseosa Cola',     900.00, TRUE, 'drink', TRUE),
  ('Agua Mineral',     700.00, TRUE, 'drink', TRUE),
  ('Edamame',         1500.00, TRUE, 'fries', TRUE),
  ('Gyozas (4u)',     1800.00, TRUE, 'fries', TRUE),
  ('Wasabi Extra',     250.00, TRUE, 'sides', TRUE),
  ('Jengibre Extra',   250.00, TRUE, 'sides', TRUE);
