"use client";

/**
 * Sushi "Piezas" (piece-count) selector — Phase 6, wired in.
 *
 * Renders one product's "Piezas" variant-group picker (fetched via
 * lib/hooks/use-products.ts's `useProductWithVariants`, priced via
 * lib/utils/variant-pricing.ts's `findVariantGroupByLabel`). It has no
 * concept of quantity or of being one of several selected lines — that's
 * owned by components/order-wizard/steps/sushi-step.tsx, which wraps one
 * instance of this component per selected line item, and by
 * components/order-wizard/hooks/use-sushi-selection.ts, which holds the
 * resulting selections. order-wizard-drawer.tsx picks SushiStep vs
 * BurgersStep based on `useVertical().orderFlow` — see
 * components/order-wizard/adapters/order-flow-adapter.ts for the shared
 * controller-level contract both flows' hooks are wrapped by.
 */

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils/format";
import { useProductWithVariants } from "@/lib/hooks/use-products";
import { findVariantGroupByLabel } from "@/lib/utils/variant-pricing";
import type { VariantOption } from "@/lib/types";

/** Matches the "Piezas" group label seeded by scripts/040-seed-from-vertical.sql
 * and declared in sushiVertical.seedTemplate.variantGroups (lib/verticals/sushi.ts). */
const PIEZAS_VARIANT_GROUP_LABEL = "Piezas";

export interface SushiPieceSelection {
  productId: string;
  variantOptionId: string;
  label: string;
  pieceCount: number | null;
  totalPrice: number;
}

interface SushiPieceSelectorProps {
  productId: string;
  onSelectionChange?: (selection: SushiPieceSelection) => void;
}

/**
 * Reads `metadata.pieces` off a variant_option when present (see
 * scripts/040-seed-from-vertical.sql, which seeds `{"pieces": 4}` /
 * `{"pieces": 8}`). Falls back to parsing the leading number out of the
 * label (e.g. "4 piezas" -> 4) for options seeded without that metadata key
 * — a defensive fallback, not the primary path.
 */
function resolvePieceCount(option: VariantOption): number | null {
  const metaValue = option.metadata?.pieces;
  if (typeof metaValue === "number") return metaValue;

  const match = option.label.match(/\d+/);
  return match ? Number(match[0]) : null;
}

/**
 * Standalone piece-count selector for one sushi product. Renders nothing
 * meaningful if the product has no "Piezas" variant group (e.g. a product
 * that isn't a roll) — mirrors the burger meat stepper's
 * `{meatExtra && (...)}` "hide if the group doesn't exist" pattern instead
 * of showing a broken/empty control.
 */
export function SushiPieceSelector({
  productId,
  onSelectionChange,
}: SushiPieceSelectorProps) {
  const { data: product, isLoading } = useProductWithVariants(productId);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  const piezasGroup = useMemo(
    () => findVariantGroupByLabel(product?.variant_groups, PIEZAS_VARIANT_GROUP_LABEL),
    [product],
  );

  const sortedOptions = useMemo(
    () =>
      [...(piezasGroup?.variant_options ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      ),
    [piezasGroup],
  );

  const activeOptionId =
    selectedOptionId ?? sortedOptions.find((o) => o.is_default)?.id ?? sortedOptions[0]?.id ?? null;

  if (isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }

  if (!piezasGroup || sortedOptions.length === 0) {
    // No "Piezas" group on this product — nothing to render, same
    // fail-quiet posture as the burger stepper when its reference extra
    // is missing.
    return null;
  }

  const handleSelect = (optionId: string) => {
    if (!optionId || !product) return;
    setSelectedOptionId(optionId);

    const option = sortedOptions.find((o) => o.id === optionId);
    if (!option || !onSelectionChange) return;

    onSelectionChange({
      productId: product.id,
      variantOptionId: option.id,
      label: option.label,
      pieceCount: resolvePieceCount(option),
      totalPrice: Number(product.base_price) + Number(option.price_delta),
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-3">
        <p className="text-sm font-medium">{PIEZAS_VARIANT_GROUP_LABEL}</p>
        <ToggleGroup
          type="single"
          value={activeOptionId ?? undefined}
          onValueChange={handleSelect}
          variant="outline"
        >
          {sortedOptions.map((option) => (
            <ToggleGroupItem key={option.id} value={option.id} className="flex-col gap-0.5 px-4">
              <span>{option.label}</span>
              {Number(option.price_delta) !== 0 && (
                <span className="text-xs text-muted-foreground">
                  {Number(option.price_delta) > 0 ? "+" : ""}
                  {formatCurrency(Number(option.price_delta))}
                </span>
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
  );
}
