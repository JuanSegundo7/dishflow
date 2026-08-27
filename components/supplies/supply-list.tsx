"use client";

import { Edit, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import type { Supply } from "@/lib/types";

interface SupplyListProps {
  supplies: Supply[];
  isLoading: boolean;
  onEdit: (supply: Supply) => void;
  onDelete: (supply: Supply) => void;
  onToggleActive: (supply: Supply) => void;
}

/**
 * Table of supplies with stock levels. Deliberately does NOT clamp or block
 * a negative stock_quantity display — it just renders it with a
 * warning-styled (not error/destructive-styled) number, per
 * scripts/041-supplies-and-stock.sql's "negative stock is allowed by
 * design" note. Low-stock/negative-stock guidance lives in
 * low-stock-banner.tsx, not here — this table never blocks anything either.
 */
export function SupplyList({
  supplies,
  isLoading,
  onEdit,
  onDelete,
  onToggleActive,
}: SupplyListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (supplies.length === 0) {
    return (
      <p className="py-20 text-center text-muted-foreground">
        No hay insumos creados
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Unidad</TableHead>
          <TableHead>Costo/unidad</TableHead>
          <TableHead>Stock</TableHead>
          <TableHead>Stock mínimo</TableHead>
          <TableHead>Activo</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {supplies.map((supply) => {
          const isLowStock = supply.stock_quantity < supply.min_stock_quantity;

          return (
            <TableRow key={supply.id} className={cn(!supply.is_active && "opacity-50")}>
              <TableCell className="font-medium">{supply.name}</TableCell>
              <TableCell>{supply.unit}</TableCell>
              <TableCell>{formatCurrency(supply.cost_per_unit)}</TableCell>
              <TableCell>
                {/* Never error-styled — negative/low stock is a warning,
                    never a blocked state. See component doc comment above. */}
                <span className={cn(isLowStock && "text-status-ready font-medium")}>
                  {supply.stock_quantity} {supply.unit}
                </span>
              </TableCell>
              <TableCell>
                {supply.min_stock_quantity} {supply.unit}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={supply.is_active}
                    onCheckedChange={() => onToggleActive(supply)}
                  />
                  {!supply.is_active && (
                    <Badge variant="secondary" className="text-xs">
                      Inactivo
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(supply)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => onDelete(supply)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
