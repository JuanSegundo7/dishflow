import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Minus, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { Burger } from "@/lib/types";
import type { SelectedSushiItem } from "@/lib/types/sushi-types";
import {
  SushiPieceSelector,
  type SushiPieceSelection,
} from "../adapters/sushi-piece-selector";

interface SushiStepProps {
  availableProducts: Burger[];
  selectedItems: SelectedSushiItem[];
  onAddItem: (product: Burger) => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onSelectionChange: (itemId: string, selection: SushiPieceSelection) => void;
}

/**
 * Sibling to steps/burgers-step.tsx for the "piece-selector" orderFlow
 * (sushi today). Top grid mirrors BurgersStep's "click a card to add"
 * pattern exactly; the selected-lines list below wraps one
 * SushiPieceSelector per line for the "Piezas" (4/8) choice, plus a
 * quantity stepper and remove button — SushiPieceSelector itself has no
 * concept of quantity or of being one of several lines (see its own doc
 * comment), so that affordance lives here instead.
 */
export function SushiStep({
  availableProducts,
  selectedItems,
  onAddItem,
  onRemoveItem,
  onUpdateQuantity,
  onSelectionChange,
}: SushiStepProps) {
  const itemCount = selectedItems.reduce(
    (acc, item) => {
      acc[item.product.id] = (acc[item.product.id] ?? 0) + item.quantity;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      {/* Available products */}
      <div>
        <h3 className="mb-3 text-sm font-medium">Seleccionar rolls</h3>
        <div className="grid grid-cols-2 gap-3">
          {availableProducts?.map((product) => {
            const qty = itemCount[product.id] ?? 0;
            return (
              <Card
                key={product.id}
                className={cn(
                  "cursor-pointer transition-all bg-card relative",
                  qty > 0
                    ? "ring-2 ring-primary border-primary"
                    : "hover:shadow-sm",
                )}
                onClick={() => onAddItem(product)}
              >
                <CardContent className="p-3">
                  {qty > 0 && (
                    <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                      {qty}
                    </Badge>
                  )}
                  <p className="font-medium">{product.name}</p>
                  <p className="text-sm font-semibold text-primary">
                    {formatCurrency(product.base_price)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Selected lines */}
      {selectedItems.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="mb-3 text-sm font-medium">
              Tu pedido ({selectedItems.length} items)
            </h3>
            <div className="space-y-3">
              {selectedItems.map((item) => (
                <Card key={item.id} className="bg-card">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {item.product.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(item.unitPrice)} c/u
                          {item.variantOptionLabel && (
                            <span> · {item.variantOptionLabel}</span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateQuantity(item.id, -1);
                          }}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>

                        <span className="w-5 text-center text-sm font-medium tabular-nums">
                          {item.quantity}
                        </span>

                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateQuantity(item.id, 1);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveItem(item.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <SushiPieceSelector
                      productId={item.product.id}
                      onSelectionChange={(selection) =>
                        onSelectionChange(item.id, selection)
                      }
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      {(!availableProducts || availableProducts.length === 0) && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p className="text-sm">No hay productos disponibles</p>
        </div>
      )}
    </div>
  );
}
