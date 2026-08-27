"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { useSupplies } from "@/lib/hooks/supplies/use-supplies";
import {
  useProductSupplies,
  useCreateProductSupply,
  useUpdateProductSupply,
  useDeleteProductSupply,
} from "@/lib/hooks/supplies/use-product-supplies";
import { useProductWithVariants } from "@/lib/hooks/use-products";
import { formatCurrency } from "@/lib/utils/format";

interface RecipeEditorProps {
  productId: string;
}

const NO_VARIANT_GROUP = "__none__";

/**
 * Per-product recipe line editor: add/remove/edit supply+quantity rows for
 * one product's `product_supplies` recipe. The `scales_with_variant_group_id`
 * picker here is deliberately simple — it just lets a line optionally
 * reference one of the product's variant groups by id/label. Phase 3 (a
 * later PR, out of scope here) is what builds the full "here's how the
 * scaling actually multiplies the recipe line's quantity" UX on top of
 * this; for now the column is populated and readable, nothing more.
 */
export function RecipeEditor({ productId }: RecipeEditorProps) {
  const { data: recipe, isLoading: recipeLoading } = useProductSupplies(productId);
  const { data: supplies, isLoading: suppliesLoading } = useSupplies();
  const { data: productWithVariants } = useProductWithVariants(productId);

  const createLine = useCreateProductSupply();
  const updateLine = useUpdateProductSupply();
  const deleteLine = useDeleteProductSupply();

  const [newSupplyId, setNewSupplyId] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [newVariantGroupId, setNewVariantGroupId] = useState(NO_VARIANT_GROUP);

  // Local edit buffers keyed by recipe line id — only lines the user has
  // touched get an entry here, so untouched lines always reflect the
  // server value straight from `recipe`.
  const [editBuffers, setEditBuffers] = useState<
    Record<string, { quantity: string; variantGroupId: string }>
  >({});

  const variantGroups = productWithVariants?.variant_groups ?? [];

  const usedSupplyIds = useMemo(
    () => new Set((recipe ?? []).map((line) => line.supply_id)),
    [recipe],
  );
  const availableSupplies = useMemo(
    () => (supplies ?? []).filter((s) => !usedSupplyIds.has(s.id)),
    [supplies, usedSupplyIds],
  );

  const handleAdd = async () => {
    if (!newSupplyId || !newQuantity) return;

    try {
      await createLine.mutateAsync({
        product_id: productId,
        supply_id: newSupplyId,
        quantity: Number(newQuantity),
        scales_with_variant_group_id:
          newVariantGroupId === NO_VARIANT_GROUP ? null : newVariantGroupId,
      });
      setNewSupplyId("");
      setNewQuantity("");
      setNewVariantGroupId(NO_VARIANT_GROUP);
    } catch {
      /* alert already shown by the mutation's onError */
    }
  };

  const handleSaveLine = async (lineId: string) => {
    const buffer = editBuffers[lineId];
    if (!buffer) return;

    try {
      await updateLine.mutateAsync({
        id: lineId,
        productId,
        quantity: Number(buffer.quantity),
        scales_with_variant_group_id:
          buffer.variantGroupId === NO_VARIANT_GROUP ? null : buffer.variantGroupId,
      });
      setEditBuffers((prev) => {
        const next = { ...prev };
        delete next[lineId];
        return next;
      });
    } catch {
      /* alert already shown by the mutation's onError */
    }
  };

  const handleRemove = async (lineId: string) => {
    try {
      await deleteLine.mutateAsync({ id: lineId, productId });
    } catch {
      /* alert already shown by the mutation's onError */
    }
  };

  if (recipeLoading || suppliesLoading) {
    return (
      <div className="space-y-2 px-3 pb-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3 px-3 pb-3">
      {(recipe ?? []).length === 0 && (
        <p className="text-xs text-muted-foreground">
          Este producto todavía no tiene receta cargada.
        </p>
      )}

      {(recipe ?? []).map((line) => {
        const buffer = editBuffers[line.id] ?? {
          quantity: line.quantity.toString(),
          variantGroupId: line.scales_with_variant_group_id ?? NO_VARIANT_GROUP,
        };
        const isDirty = !!editBuffers[line.id];
        const isMissing = !line.supply;
        const isInactive = !!line.supply && !line.supply.is_active;

        return (
          <div key={line.id} className="flex items-center gap-2">
            <span className="w-32 shrink-0 truncate text-sm font-medium">
              {line.supply?.name ?? "Insumo eliminado"}
              {(isMissing || isInactive) && (
                <span className="ml-1 text-xs text-status-ready">
                  ({isMissing ? "faltante" : "inactivo"})
                </span>
              )}
            </span>

            <Input
              type="number"
              className="w-24"
              value={buffer.quantity}
              onChange={(e) =>
                setEditBuffers((prev) => ({
                  ...prev,
                  [line.id]: { ...buffer, quantity: e.target.value },
                }))
              }
            />

            <span className="text-xs text-muted-foreground shrink-0">
              {line.supply?.unit ?? ""}
            </span>

            <Select
              value={buffer.variantGroupId}
              onValueChange={(v) =>
                setEditBuffers((prev) => ({ ...prev, [line.id]: { ...buffer, variantGroupId: v } }))
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Sin escalado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_VARIANT_GROUP}>Sin escalado</SelectItem>
                {variantGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isDirty && (
              <Button size="sm" onClick={() => handleSaveLine(line.id)} disabled={updateLine.isPending}>
                Guardar
              </Button>
            )}

            <Button
              size="icon"
              variant="ghost"
              className="text-destructive"
              onClick={() => handleRemove(line.id)}
              disabled={deleteLine.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}

      <div className="flex items-center gap-2 pt-2 border-t">
        <Select value={newSupplyId} onValueChange={setNewSupplyId}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Insumo" />
          </SelectTrigger>
          <SelectContent>
            {availableSupplies.map((supply) => (
              <SelectItem key={supply.id} value={supply.id}>
                {supply.name} ({formatCurrency(supply.cost_per_unit)}/{supply.unit})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          className="w-24"
          placeholder="Cant."
          value={newQuantity}
          onChange={(e) => setNewQuantity(e.target.value)}
        />

        <Select value={newVariantGroupId} onValueChange={setNewVariantGroupId}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sin escalado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_VARIANT_GROUP}>Sin escalado</SelectItem>
            {variantGroups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={!newSupplyId || !newQuantity || createLine.isPending}
        >
          <Plus className="mr-1 h-4 w-4" />
          Agregar
        </Button>
      </div>
    </div>
  );
}
