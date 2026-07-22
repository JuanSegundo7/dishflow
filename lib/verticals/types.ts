/**
 * Vertical configuration layer — Phase 0 scaffolding.
 *
 * Dishflow is currently hardwired to burgers (table `burgers`, FK
 * `burger_id`, CHECK enums `burger/extra/drink/fries`). The long-term goal
 * is to genericize the schema into a `products` + `variant_groups` +
 * `variant_options` model so one codebase can serve burger/sushi/pizza/etc
 * verticals, with vertical-specific behavior isolated behind the
 * `VerticalDefinition` shape declared here.
 *
 * IMPORTANT: this module is scaffolding only. Nothing in the app imports it
 * yet — see lib/verticals/burger.ts for the burger vertical encoded as data,
 * and lib/verticals/index.ts for how a deployment's active vertical will
 * eventually be resolved from the control-panel entitlements response.
 *
 * `key` values must match the control-panel's `projects.category` column
 * slugs verbatim: "hamburgueseria" | "pizzeria" | "sushi" | "panaderia" |
 * "cafeteria" | "otro".
 */

export type VerticalCategorySlug =
  | "hamburgueseria"
  | "pizzeria"
  | "sushi"
  | "panaderia"
  | "cafeteria"
  | "otro";

/**
 * How the order-building UI behaves for this vertical.
 * - "builder-wizard": today's burger flow — pick a base product, customize
 *   ingredients/meat-count/fries-count, add extras, optionally build combos.
 * - "piece-selector": e.g. sushi — pick pieces/rolls by count, no per-item
 *   ingredient customization.
 * - "size-crust-selector": e.g. pizza — pick a size + crust variant, then
 *   toppings.
 */
export type OrderFlow =
  | "builder-wizard"
  | "piece-selector"
  | "size-crust-selector";

/**
 * Labels for the 4 extra/variant categories that exist today as the
 * `extras.category` CHECK enum (extra/drink/fries/sides). Later phases may
 * replace this fixed 4-slot shape with a fully dynamic `variant_groups`
 * list; this is deliberately kept 1:1 with what already exists so Phase 0
 * introduces no new concepts, only names today's hardcoded strings.
 */
export interface VariantGroupLabels {
  extra: string;
  drink: string;
  fries: string;
  sides: string;
}

/** A page's Header title/subtitle, as rendered today via <Header title=... subtitle=... />. */
export interface PageCopy {
  title: string;
  subtitle: string;
}

export interface VerticalLabels {
  /** Singular noun for the main sellable product, e.g. "hamburguesa". */
  productNoun: string;
  /** Plural of productNoun, e.g. "hamburguesas". */
  productNounPlural: string;
  variantGroupLabels: VariantGroupLabels;
  /** Copy for the pages that are vertical-flavored today. */
  pages: {
    menu: PageCopy;
    precios: PageCopy;
    extras: PageCopy;
    combos: PageCopy;
    rendimiento: PageCopy;
  };
}

export interface VerticalFeatureFlags {
  /** Whether this vertical supports bundling items into combos (combos/combo_slots/combo_slots_rules). */
  hasCombos: boolean;
  /** Whether a product's default "meat" variant can be swapped for a veggie substitute (today: burger patty -> veggie patty). */
  hasVeggieSubstitution: boolean;
  /** Whether a product can be split into two halves with different variants (e.g. half-and-half pizza). Not used by any vertical yet. */
  hasHalfAndHalf: boolean;
}

/** One option inside a seed variant group, for future clone-seeding of a new deployment. */
export interface SeedVariantOption {
  name: string;
  /** Price delta relative to the product base price, if any. */
  priceDelta?: number;
}

/** One seed variant group (mirrors today's extras.category buckets). */
export interface SeedVariantGroup {
  key: keyof VariantGroupLabels | (string & {});
  label: string;
  options: SeedVariantOption[];
}

/** One seed menu category (mirrors today's `categories` table shape). */
export interface SeedCategory {
  name: string;
  type: string;
}

/**
 * Default data to seed a brand-new deployment of this vertical. Not
 * consumed by any code yet — this documents the shape a future
 * clone-seeding script would read.
 */
export interface VerticalSeedTemplate {
  categories: SeedCategory[];
  variantGroups: SeedVariantGroup[];
}

/**
 * One stat tile on the /rendimiento page's "Unidades vendidas" card, as
 * hardcoded today in app/(dashboard)/rendimiento/page.tsx and computed by
 * useProductStats in lib/hooks/orders/use-orders-history.ts.
 */
export interface RendimientoTile {
  /** Key into the ProductStats-shaped aggregation result, e.g. "totalMedallones". */
  key: string;
  /** Display label, e.g. "Medallones". */
  label: string;
  emoji: string;
  /**
   * Which variant-group label(s) (or "burger"/"combo" pseudo-groups) roll
   * up into this tile's count. Mirrors the category checks in
   * useProductStats today (e.g. extras.category === "extra" contributes to
   * the "Medallones" tile for the burger vertical).
   */
  rollsUpFrom: string[];
}

export interface RendimientoConfig {
  tiles: RendimientoTile[];
}

/**
 * Full configuration for one vertical. One `VerticalDefinition` = one
 * business type Dishflow can be deployed as.
 */
export interface VerticalDefinition {
  /** Must match a control-panel `projects.category` slug — see VerticalCategorySlug. */
  key: VerticalCategorySlug;
  displayName: string;
  labels: VerticalLabels;
  orderFlow: OrderFlow;
  features: VerticalFeatureFlags;
  seedTemplate: VerticalSeedTemplate;
  rendimiento: RendimientoConfig;
}
