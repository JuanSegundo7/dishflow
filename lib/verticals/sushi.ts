import type { VerticalDefinition } from "./types";

/**
 * The sushi vertical, encoded as data — Phase 6.
 *
 * This is the first VerticalDefinition authored for a business type OTHER
 * than burgers, proving the products/variant_groups/variant_options model
 * built in Phases 1-4 genuinely generalizes past the vertical it was
 * extracted from. Nothing in the live app resolves to this vertical yet
 * (see the scope note in registry.ts and lib/verticals/index.ts's own
 * "Phase 0 scaffolding" header) — this file only makes `sushi` resolve to a
 * REAL definition instead of the burgerVertical fallback every other
 * unmapped category slug still uses.
 *
 * A sushi place sells by PIECE COUNT (4/8 piezas per roll), not by
 * per-ingredient customization the way a burger is built — hence
 * `orderFlow: "piece-selector"` instead of "builder-wizard". See
 * components/order-wizard/adapters/sushi-piece-selector.tsx for a
 * standalone (currently unwired) UI component for that flow.
 *
 * DELIBERATE ADAPTATIONS FROM BURGER'S SHAPE (not just relabeling):
 *
 * - `variantGroupLabels` is still the FIXED 4-slot shape from Phase 0
 *   (extra/drink/fries/sides — see types.ts's own comment: "Later phases
 *   may replace this fixed 4-slot shape with a fully dynamic variant_groups
 *   list"). That shape was extracted 1:1 from burger's `extras.category`
 *   CHECK enum and does not have a natural home for sushi concepts. Rather
 *   than invent new keys here (which would mean widening VerticalLabels
 *   itself — out of scope for this phase), the 4 existing slots are
 *   reassigned to the closest sushi equivalents:
 *     - extra -> "Salsas" (soja, agridulce, spicy mayo, unagi)
 *     - drink -> "Bebidas" (unchanged concept)
 *     - fries -> "Acompañamientos" (edamame, gyozas, arroz extra — burger's
 *       "fries" slot was always just "the per-unit steppable side", which
 *       maps reasonably onto sushi's steppable sides)
 *     - sides -> "Extras" (wasabi, jengibre, palitos, soja extra)
 *   This is a forced fit into a burger-shaped interface, flagged here
 *   rather than silently pretending it's a natural design — a real 4th
 *   vertical (pizza, panadería) would likely expose the same friction and
 *   is the strongest argument for actually building the "fully dynamic
 *   variant_groups list" types.ts already anticipates.
 * - `hasCombos: false` — sushi combos (e.g. "2 rolls + bebida") are a real,
 *   common product for this vertical, but nothing about combos was scoped
 *   into this phase (deliberately deferred per the task). This flag
 *   currently documents intent only: grepping the app for `hasCombos` turns
 *   up zero read sites outside lib/verticals/*.ts — no sidebar/nav/page
 *   today hides the Combos link or route when a vertical sets this false.
 *   That is a known gap, not something this phase builds a fix for (see
 *   docs/cloning-a-new-vertical.md's follow-up section).
 */
export const sushiVertical: VerticalDefinition = {
  key: "sushi",
  displayName: "Sushi Bar",

  labels: {
    productNoun: "roll",
    productNounPlural: "rolls",
    variantGroupLabels: {
      extra: "Salsas",
      drink: "Bebidas",
      fries: "Acompañamientos",
      sides: "Extras",
    },
    pages: {
      menu: {
        title: "Menú",
        subtitle: "Administra los rolls del menú",
      },
      precios: {
        title: "Precios",
        subtitle: "Configuración central de precios",
      },
      extras: {
        title: "Extras",
        subtitle: "Administra salsas, bebidas, acompañamientos y extras",
      },
      combos: {
        // Generic title kept even though hasCombos is false — see the
        // class-level comment above: nothing in the app currently reads
        // this flag to hide the page/link, so this copy would render
        // as-is if a deployment ever navigated here.
        title: "Combos",
        subtitle: "Creá y administrá combos reutilizando rolls y acompañamientos",
      },
      rendimiento: {
        title: "Rendimiento",
        subtitle: "Análisis de ventas",
      },
    },
  },

  orderFlow: "piece-selector",

  features: {
    hasCombos: false,
    hasVeggieSubstitution: false,
    hasHalfAndHalf: false,
  },

  // Default categories/variant groups for clone-seeding a new sushi-vertical
  // deployment. See scripts/040-seed-from-vertical.sql for a concrete,
  // working seed built from this exact shape.
  seedTemplate: {
    categories: [
      { name: "Rolls", type: "roll" },
      { name: "Salsas", type: "extra" },
      { name: "Bebidas", type: "drink" },
      { name: "Acompañamientos", type: "fries" },
      { name: "Extras", type: "sides" },
    ],
    variantGroups: [
      { key: "extra", label: "Salsas", options: [] },
      { key: "drink", label: "Bebidas", options: [] },
      { key: "fries", label: "Acompañamientos", options: [] },
      { key: "sides", label: "Extras", options: [] },
      // The actual per-roll piece-count group. Unlike the 4 slots above
      // (addon categories, populated per-deployment with real products),
      // this is a per-PRODUCT variant group every roll gets, structurally
      // analogous to burger's "Medallones"/"Papas" groups in
      // scripts/010-generic-products.sql (a `single`-selection group whose
      // options are priced by delta from a default option). "4 piezas" is
      // the default (price_delta 0, i.e. the roll's base_price already
      // covers 4 pieces); "8 piezas" carries a positive delta.
      {
        key: "piezas",
        label: "Piezas",
        options: [
          { name: "4 piezas", priceDelta: 0 },
          { name: "8 piezas", priceDelta: 2800 },
        ],
      },
    ],
  },

  // Adapted from burger's 6-tile "Unidades vendidas" card shape (see
  // burger.ts), not just relabeled: totalCombos is dropped (hasCombos:
  // false) and totalExtras (wasabi/jengibre/palitos) takes its slot instead.
  // NOTE: like burger's tiles, these `key`/`rollsUpFrom` values describe a
  // FUTURE per-vertical ProductStats shape — today's real
  // useProductStats()/ProductStats (lib/hooks/orders/use-orders-history.ts)
  // is still hardcoded to burger's exact fields (totalBurgers,
  // totalMedallones, ...) and does not yet read any VerticalDefinition.
  // This is documentation-as-code for that future generalization, same as
  // burger's rendimiento config already was before this phase.
  rendimiento: {
    tiles: [
      { key: "totalRolls", label: "Rolls", emoji: "🍣", rollsUpFrom: ["roll"] },
      { key: "totalPiezas", label: "Piezas", emoji: "🍱", rollsUpFrom: ["piezas"] },
      { key: "totalSalsas", label: "Salsas", emoji: "🥢", rollsUpFrom: ["extra"] },
      { key: "totalAcompanamientos", label: "Acompañamientos", emoji: "🥟", rollsUpFrom: ["fries"] },
      { key: "totalExtras", label: "Extras", emoji: "🧊", rollsUpFrom: ["sides"] },
      { key: "totalDrinks", label: "Bebidas", emoji: "🥤", rollsUpFrom: ["drink"] },
    ],
  },
};
