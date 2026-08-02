-- Seed starter data for a new restaurant instance.
-- Replace the rows below with the real menu/pricing for each client deployment.
-- Columns must match scripts/001-create-schema.sql.

-- Sample burgers (menu items)
INSERT INTO burgers (name, description, base_price, ingredients, is_available) VALUES
  ('Sample Item 1', 'Placeholder description for a menu item', 1000.00, ARRAY['ingredient 1', 'ingredient 2'], true),
  ('Sample Item 2', 'Placeholder description for a menu item', 1200.00, ARRAY['ingredient 1', 'ingredient 2', 'ingredient 3'], true);

-- Sample extras (extras, drinks, fries, sides)
-- Note: combos are no longer an `extras.category` value — they're seeded via
-- the `combos`/`combo_slots`/`combo_slots_rules` tables (see 000-baseline-schema.sql).
INSERT INTO extras (name, category, price, is_available) VALUES
  ('Sample Extra', 'extra', 100.00, true),
  ('Sample Drink', 'drink', 200.00, true),
  ('Sample Fries', 'fries', 300.00, true);

-- Sample customers (optional demo data, safe to remove)
INSERT INTO customers (name, address, phone) VALUES
  ('Sample Customer', 'Sample Address 123', '000-000-0000');
