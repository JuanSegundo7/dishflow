-- ============================================================
-- Dishflow — Reconstructed baseline schema (000)
-- ============================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- `001-create-schema.sql` (committed, historical) is STALE: it does not
-- match what the running application actually reads/writes. This file is a
-- best-effort reconstruction of the TRUE live schema, assembled by reading:
--   - lib/types/index.ts and lib/types/combo-types.ts (the TS types the app
--     treats as its source of truth for DB shape)
--   - every `supabase.from("...")` call site under lib/hooks/**,
--     hooks/**, and components/order-wizard/services/** (to confirm actual
--     table/column names, nullability, and a few columns that exist in the
--     DB but are NOT in any TS type — see the ASSUMPTION notes below)
--
-- WHAT THIS FILE IS NOT
-- ----------------------
-- This was NOT introspected from a live Supabase connection — no DB
-- credentials were available in this session. Treat it as a documentation
-- aid and a migration-planning starting point, not as ground truth.
-- Before relying on this for any later-phase migration (e.g. the
-- products/variant_groups genericization work), run:
--
--   supabase db dump --schema public -f live-schema.sql
--
-- and diff it against this file. Reconcile any drift into this file (or
-- replace this file's role with the real dump) before writing migrations
-- against it.
--
-- `001-create-schema.sql` is left untouched as historical record. Do not
-- merge this file's contents back into it.
--
-- CONVENTIONS PRESERVED FROM 001
-- --------------------------------
-- Same "internal dashboard" RLS posture as 001: RLS is enabled on every
-- table with a single permissive "allow all" policy. This file preserves
-- that posture for every table (old and newly-documented) rather than
-- guessing at tighter policies that were never confirmed to exist live.
--
-- KEY DISCREPANCIES FOUND VS. 001 (see inline ASSUMPTION/FINDING comments
-- for full detail):
--   - `extras.category` CHECK no longer includes 'combo' (combos are now a
--     first-class `combos` + `combo_slots` + `combo_slots_rules` structure)
--     and gained 'sides' (lib/types/index.ts ExtraCategory union).
--   - `orders.status` CHECK no longer includes 'paid' — lib/types/index.ts
--     has an explicit comment marking it as removed from the DB.
--   - `orders` gained: is_paid, delivery_type, delivery_fee, payment_method,
--     delivery_time, discount_type, discount_value, discount_amount,
--     customer_address_id, and pending_print (the last one is NOT in any TS
--     type — found only via a raw `.update({ pending_print: true })` call).
--   - `order_items` gained: extra_id, combo_id (both nullable — an item is
--     exactly one of "burger", "combo", or "standalone extra/side").
--   - New tables entirely absent from 001: customer_addresses, combos,
--     combo_slots, combo_slots_rules, external_income.
--   - `burgers` gained default_meat_quantity, default_fries_quantity.
--
-- ============================================================

-- ============================================================
-- Customers
-- ============================================================

-- Unchanged from 001.
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- NEW vs. 001. Confirmed by lib/types/index.ts CustomerAddress interface and
-- every call site in lib/hooks/use-customers.ts / hooks/use-addresses.ts.
CREATE TABLE customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Principal',
  address TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Categories
-- ============================================================

-- Unchanged from 001. FINDING: no `supabase.from("categories")` call exists
-- anywhere in the current app code (grepped lib/**, hooks/**, app/**,
-- components/**) — this table appears vestigial/unused by the running app.
-- Carried forward as-is rather than guessing at a shape nothing exercises;
-- its live existence and shape are unconfirmed.
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('burger', 'extra', 'drink', 'fries')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Burgers
-- ============================================================

-- default_meat_quantity / default_fries_quantity are NEW vs. 001. Confirmed
-- by lib/types/index.ts Burger interface (comments there literally say
-- "Viene de DB como smallint" / "numeric") and by use-menu-crud.ts,
-- order-data-loader.ts, order-data-transformer.ts, use-orders-history.ts
-- (useProductStats) all reading/writing these two columns directly.
CREATE TABLE burgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  base_price DECIMAL(10, 2) NOT NULL,
  ingredients TEXT[] DEFAULT '{}',
  is_available BOOLEAN DEFAULT TRUE,
  image_url TEXT,
  default_meat_quantity SMALLINT NOT NULL DEFAULT 2,
  default_fries_quantity NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Extras (extras, drinks, fries, sides)
-- ============================================================

-- FINDING: category CHECK changed vs. 001. lib/types/index.ts's
-- ExtraCategory union is `"extra" | "drink" | "fries" | "sides"` — no
-- 'combo' (combos moved to their own combos/combo_slots/combo_slots_rules
-- tables below) and 'sides' was added (confirmed by app/(dashboard)/extras
-- page's categoryLabels map and useProductStats' category switch in
-- lib/hooks/orders/use-orders-history.ts).
CREATE TABLE extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('extra', 'drink', 'fries', 'sides')),
  price DECIMAL(10, 2) NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Combos
-- ============================================================

-- NEW tables entirely absent from 001. Confirmed by lib/types/combo-types.ts
-- (Combo, ComboSlot, ComboSlotRule interfaces) and every call site in
-- lib/hooks/use-combos.ts.
CREATE TABLE combos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE combo_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  -- slot_type is a free-form string in the live DB, not a CHECK-constrained
  -- enum: lib/types/combo-types.ts's own comment says
  -- `"burger" | "drink" | "side" | "nuggets" (cualquier string en DB)`.
  -- No CHECK added here to avoid inventing a constraint that may not exist.
  slot_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  default_meat_quantity SMALLINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ASSUMPTION: the live table name is `combo_slots_rules` (confirmed by every
-- `.from(...)` call in lib/hooks/use-combos.ts), NOT `combo_slot_rules`
-- (singular) as the TS interface name `ComboSlotRule` in
-- lib/types/combo-types.ts might suggest — that TS name is just an
-- interface identifier, not the table name.
--
-- ASSUMPTION: `id` is modeled here as a plain serial/int (not UUID). This is
-- inferred from ComboSlotRule.id being typed `number` in
-- lib/types/combo-types.ts, unlike every other table's `id: string` (UUID).
-- This is the one PK in the whole schema that looks like it deviates from
-- the UUID-everywhere convention — flag this specifically for confirmation
-- against a real `supabase db dump` before any later-phase migration touches
-- this table.
CREATE TABLE combo_slots_rules (
  id BIGSERIAL PRIMARY KEY,
  combo_slot_id UUID NOT NULL REFERENCES combo_slots(id) ON DELETE CASCADE,
  rule_type TEXT,
  rule_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Orders
-- ============================================================

-- FINDING: status CHECK changed vs. 001. lib/types/index.ts's OrderStatus
-- union is `"new" | "ready" | "completed" | "canceled"` with an explicit
-- inline comment: `// ❌ Eliminar "paid" (no está en DB)` — i.e. 'paid' was
-- removed from the live status enum after 001 was written, and payment
-- state is now tracked separately via the `is_paid` boolean below.
--
-- delivery_type / delivery_fee / payment_method / delivery_time /
-- discount_type / discount_value / discount_amount / customer_address_id /
-- is_paid are all NEW vs. 001 — confirmed by lib/types/index.ts Order
-- interface and by lib/hooks/orders/use-create-order.ts,
-- use-update-order.ts, use-orders.ts insert/update payloads.
--
-- ASSUMPTION: delivery_time is modeled as TEXT (not TIMESTAMPTZ/TIME). Every
-- call site treats it as an opaque nullable string (`order.delivery_time ||
-- ""`, `input.delivery_time ?? null`) — no code path parses it as a
-- date/time value, so its real column type could not be confirmed from
-- usage alone. Verify against a live dump before depending on this in a
-- migration.
--
-- FINDING: `pending_print` is NOT present in ANY TS type (Order in
-- lib/types/index.ts has no such field), yet
-- lib/hooks/orders/use-orders.ts' useCompleteOrder mutation does
-- `.update({ status: "completed", pending_print: true, ... })` directly
-- against the `orders` table. This means the live DB almost certainly has
-- this column (or the mutation would fail at runtime), but it's undocumented
-- anywhere in the type layer — a real gap between the TS types and the DB
-- that this baseline surfaces on purpose. Modeled here as a boolean flag for
-- a (presumably external/local) print-queue service to pick up.
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL,
  customer_id UUID REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_address_id UUID REFERENCES customer_addresses(id),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'ready', 'completed', 'canceled')),
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  delivery_type TEXT NOT NULL DEFAULT 'pickup' CHECK (delivery_type IN ('pickup', 'delivery')),
  delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'transfer')),
  delivery_time TEXT,
  discount_type TEXT DEFAULT 'none' CHECK (discount_type IN ('amount', 'percentage', 'none')),
  discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  pending_print BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Order items
-- ============================================================

-- FINDING: extra_id and combo_id are NEW vs. 001, and burger_id became
-- nullable. An order_item is exactly one of:
--   - a burger (burger_id set, extra_id/combo_id null)
--   - a combo (combo_id set, burger_id/extra_id null) — see
--     order-data-loader.ts's `loadOrderIntoWizard` filters
--     (`!item.combo_id && !item.extra_id` for burgers, `!!item.extra_id`
--     for sides, `!!item.combo_id` for combos).
--   - a standalone extra/side ordered as a main item (extra_id set)
-- No CHECK constraint added to enforce this "exactly one of" invariant
-- since it was never confirmed to exist as a real DB constraint (it's
-- enforced only in application code) — flagging this as something later
-- phases may want to formalize.
--
-- customizations is modeled as TEXT (not JSONB): both
-- order-data-transformer.ts (writes `JSON.stringify(...)`) and
-- order-data-loader.ts (reads `JSON.parse(item.customizations)`) treat it as
-- an opaque string column, never using Postgres JSON operators.
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  burger_id UUID REFERENCES burgers(id),
  combo_id UUID REFERENCES combos(id),
  extra_id UUID REFERENCES extras(id),
  burger_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  customizations TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Order item extras (extras added on top of a burger/combo/side item)
-- ============================================================

-- Unchanged from 001.
CREATE TABLE order_item_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  extra_id UUID NOT NULL REFERENCES extras(id),
  extra_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- External income
-- ============================================================

-- NEW table entirely absent from 001. Confirmed by lib/types/index.ts
-- ExternalIncome interface and lib/hooks/orders/use-external-income.ts.
-- `date` is a plain DATE (YYYY-MM-DD) — use-orders-history.ts explicitly
-- treats it as "DATE column, no TZ conversion needed" in a comment.
CREATE TABLE external_income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

-- From 001, unchanged.
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_item_extras_order_item_id ON order_item_extras(order_item_id);

-- New vs. 001, added for the new/changed FK columns above. Not confirmed
-- live — reasonable defaults for the access patterns seen in the hooks.
CREATE INDEX idx_customer_addresses_customer_id ON customer_addresses(customer_id);
CREATE INDEX idx_orders_customer_address_id ON orders(customer_address_id);
CREATE INDEX idx_order_items_combo_id ON order_items(combo_id);
CREATE INDEX idx_order_items_extra_id ON order_items(extra_id);
CREATE INDEX idx_combo_slots_combo_id ON combo_slots(combo_id);
CREATE INDEX idx_combo_slots_rules_combo_slot_id ON combo_slots_rules(combo_slot_id);
CREATE INDEX idx_external_income_date ON external_income(date);

-- ============================================================
-- Row Level Security
-- ============================================================

-- Same "allow all" internal-dashboard posture as 001, extended to every
-- table documented above (old and new).
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE burgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_slots_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on customers" ON customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on customer_addresses" ON customer_addresses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on categories" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on burgers" ON burgers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on extras" ON extras FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on combos" ON combos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on combo_slots" ON combo_slots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on combo_slots_rules" ON combo_slots_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on order_item_extras" ON order_item_extras FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on external_income" ON external_income FOR ALL USING (true) WITH CHECK (true);
