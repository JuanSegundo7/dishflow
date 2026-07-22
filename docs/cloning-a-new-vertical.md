# Cloning Dishflow for a new business (vertical)

Phase 6 of the products/variant_groups genericization refactor added a
second real vertical (`sushiVertical`, see `lib/verticals/sushi.ts`) to
prove the generic model built in Phases 0-4 actually supports more than
burgers. This doc is the concrete runbook for cloning Dishflow into a new
deployment for a real business, using that work as the worked example.

Note: this file did not exist before Phase 6. Earlier phases' research
referenced a `docs/entitlements-api.md` that was expected to already exist
in this repo — as of this session, neither that file nor a `docs/` folder
were actually present. Only this file was created here; documenting the
entitlements API itself is not part of this phase's scope.

## 1. Provision the database

1. Clone the Dishflow repo for the new deployment.
2. Provision a new, empty Supabase project for it.
3. Run the full migration chain in order against that project:
   `scripts/000-baseline-schema.sql` through `scripts/031-drop-legacy-compat.sql`.
   These are the schema migrations — run them in numeric order, no skipping
   (later scripts assume earlier ones already ran; see each file's own
   header for what it depends on).
4. Run a vertical-specific seed script on top. For sushi, that's
   `scripts/040-seed-from-vertical.sql` — it inserts a handful of real
   sample rolls (with "Piezas" 4/8-piece variant groups) and addon products
   (salsas/bebidas/acompañamientos/extras), driven by the shape
   `sushiVertical.seedTemplate` declares in `lib/verticals/sushi.ts`. A
   different vertical would get its own `04X-seed-*.sql` file following the
   same structure (products + variant_groups + variant_options), not a
   copy-paste of sushi's concrete data.
5. Point the new deployment's environment variables (Supabase URL/anon
   key/service role key, etc.) at this new project.

## 2. Register the business in control-panel

The control-panel repo (`solvifylabs/control-panel`) is the agency's admin
panel tracking every client project, independent of Dishflow's own
database. To onboard a new business:

1. Insert a `projects` row for it — following the existing pattern used for
   Jebbs in `control-panel/scripts/002-seed-data.sql` — including a real
   `category` value (e.g. `'sushi'`) on the `projects` table. That column
   was added by `control-panel/scripts/003-project-business-details.sql`
   with a CHECK constraint matching the exact same 6 slugs Dishflow's
   `VerticalCategorySlug` type declares (`hamburgueseria`, `pizzeria`,
   `sushi`, `panaderia`, `cafeteria`, `otro`) — the two enums are meant to
   stay in lockstep.
2. Insert its `plans`/`subscriptions` rows (same pattern — see
   `002-seed-data.sql`'s `plans`/`subscriptions` inserts).
3. Insert its `services` rows for whatever services this business actually
   gets (dashboard, ticket printing, stock management, etc. — see the same
   seed file).
4. Generate its API key via the existing `project_api_keys` flow
   (`control-panel/lib/api-keys.ts`, `control-panel/app/api/projects/[id]/api-keys`)
   and hand it to the new Dishflow deployment as `CONTROL_PANEL_API_KEY`.

## 3. THE #1 OPEN GAP — `category` is not in the entitlements response yet

**This is the single most important loose end in the entire vertical-switching
mechanism, and it will silently break every new clone until it's fixed.**

Verified directly in this session, both sides of the wire:

- **control-panel side**: the `projects` table already has a real,
  populated `category` column (`Project.category: ProjectCategory` in
  `control-panel/lib/types/index.ts`, added by
  `scripts/003-project-business-details.sql`). But
  `control-panel/app/api/v1/entitlements/route.ts` builds its response's
  `project` object as:

  ```ts
  project: { slug: project.slug, name: project.name, status: project.status },
  ```

  — `category` is fetched from the DB (it's part of the `projects` row
  selected earlier in that same handler) but never copied into the response
  body. It is silently dropped.

- **Dishflow side**: `lib/entitlements.ts`'s `EntitlementsResponse.project.category`
  is already typed as optional (`category?: string`) with a comment flagging
  exactly this — the field doesn't exist in the real response today. And
  `lib/verticals/index.ts`'s `getActiveVertical()` fails open to
  `burgerVertical` whenever `category` is missing or unrecognized.

**Net effect**: today, EVERY Dishflow deployment — sushi, pizza, whatever —
resolves to `burgerVertical` in production, regardless of its real
`projects.category` value in control-panel, because the field never makes
it across the wire. `sushiVertical` existing in the registry (this phase's
work) changes nothing about that until this is fixed.

**Fix required (out of scope for this phase — different repo)**: add
`category: project.category` to the `project` object in
`control-panel/app/api/v1/entitlements/route.ts`'s response body. Until
that one-line change ships, do not expect a sushi (or any non-burger)
clone to actually render sushi-flavored UI in production — it will look
and behave exactly like a burger deployment.

## 4. Known follow-up work from Phase 6 (not silently forgotten)

Two things were deliberately left undone this phase, on top of the gap
above:

1. **The sushi order-wizard adapter is built but not wired in.**
   `components/order-wizard/adapters/sushi-piece-selector.tsx` is a real,
   working piece-count selector component (reads a product's "Piezas"
   variant group via `useProductWithVariants`, prices it via
   `resolveVariantDelta`/`findVariantGroupByLabel`) — but nothing imports
   it. Phase 3 never extracted the burger builder behind a swappable
   adapter interface, so there is no live mechanism today that picks a
   builder UI based on `VerticalDefinition.orderFlow`. Wiring sushi's
   adapter in requires building that switching mechanism first, and doing
   so should happen in the SAME pass as finally extracting the burger
   builder — not sushi now, burger later.
2. **Combos are not generalized.** `sushiVertical.features.hasCombos` is
   `false`, but this flag is currently documentation-only: grepping the app
   finds zero places outside `lib/verticals/*.ts` that read `hasCombos` to
   hide the Combos nav link or route. A vertical with `hasCombos: false`
   today still gets a fully-functional (if conceptually inapplicable)
   Combos page. Building that hiding logic — and, separately, generalizing
   combos to work meaningfully for non-burger verticals — was explicitly
   deferred out of this phase.

## Summary checklist for a new clone

- [ ] Provision Supabase project, run `scripts/000` → `scripts/031`
- [ ] Run the vertical's seed script (e.g. `scripts/040-seed-from-vertical.sql` for sushi)
- [ ] Point Dishflow env vars at the new Supabase project
- [ ] Seed the business in control-panel (`projects` + `category` + `plans`/`subscriptions` + `services`)
- [ ] Generate and configure its `CONTROL_PANEL_API_KEY`
- [ ] **Confirm control-panel's entitlements route now returns `project.category` before trusting `getActiveVertical()` in production** (see §3 — not done as of this writing)
- [ ] If the vertical needs its own order-wizard flow, build the adapter-switching mechanism first (see §4.1) — don't assume `sushi-piece-selector.tsx` is live just because it exists
