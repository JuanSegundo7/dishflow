import type { VerticalCategorySlug, VerticalDefinition } from "./types";
import { burgerVertical } from "./burger";
import { sushiVertical } from "./sushi";

/**
 * Maps a control-panel `projects.category` slug to its VerticalDefinition.
 *
 * TODO(vertical-genericization): only "hamburgueseria" and "sushi" have real
 * vertical definitions today (see burger.ts / sushi.ts — sushi added in
 * Phase 6 to prove the products/variant_groups model generalizes past
 * burgers). Every other category slug is still a deliberate placeholder
 * that falls back to burgerVertical until its own VerticalDefinition is
 * authored in a later phase. This is NOT a claim that pizza/panadería/etc
 * should behave like a burger vertical long-term — it only means "nothing
 * else exists yet, don't crash or leave the UI unconfigured".
 */
export const VERTICAL_REGISTRY: Record<VerticalCategorySlug, VerticalDefinition> = {
  hamburgueseria: burgerVertical,
  pizzeria: burgerVertical, // TODO(vertical-genericization): author pizzaVertical
  sushi: sushiVertical,
  panaderia: burgerVertical, // TODO(vertical-genericization): author panaderiaVertical
  cafeteria: burgerVertical, // TODO(vertical-genericization): author cafeteriaVertical
  otro: burgerVertical, // TODO(vertical-genericization): decide fallback behavior for "otro"
};

export function isKnownVerticalCategorySlug(
  value: string,
): value is VerticalCategorySlug {
  return Object.prototype.hasOwnProperty.call(VERTICAL_REGISTRY, value);
}
