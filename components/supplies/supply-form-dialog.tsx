"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateSupply, useUpdateSupply } from "@/lib/hooks/supplies/use-supplies-crud";
import type { Supply, SupplyUnit } from "@/lib/types";

interface SupplyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing, null when creating. */
  supply: Supply | null;
}

const UNIT_OPTIONS: { value: SupplyUnit; label: string }[] = [
  { value: "g", label: "Gramos (g)" },
  { value: "kg", label: "Kilogramos (kg)" },
  { value: "ml", label: "Mililitros (ml)" },
  { value: "l", label: "Litros (l)" },
  { value: "unit", label: "Unidad" },
];

const EMPTY_FORM = {
  name: "",
  unit: "g" as SupplyUnit,
  cost_per_unit: "",
  stock_quantity: "",
  min_stock_quantity: "",
  is_active: true,
};

/**
 * Create/edit supply form. `stock_quantity` (and `min_stock_quantity`)
 * inputs deliberately have NO `min="0"` — this is the exact clamping bug
 * this repo already avoids on delivery-fee/discount-style numeric fields
 * that are allowed to be edited freely; here it matters even more, since
 * scripts/041-supplies-and-stock.sql's whole point is that negative stock
 * is a valid, meaningful state (a manual count correction can legitimately
 * go negative). Do not add a `min` prop to those two inputs.
 */
export function SupplyFormDialog({ open, onOpenChange, supply }: SupplyFormDialogProps) {
  const [form, setForm] = useState(EMPTY_FORM);

  const createSupply = useCreateSupply();
  const updateSupply = useUpdateSupply();
  const isSaving = createSupply.isPending || updateSupply.isPending;

  useEffect(() => {
    if (!open) return;

    if (supply) {
      setForm({
        name: supply.name,
        unit: supply.unit,
        cost_per_unit: supply.cost_per_unit.toString(),
        stock_quantity: supply.stock_quantity.toString(),
        min_stock_quantity: supply.min_stock_quantity.toString(),
        is_active: supply.is_active,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, supply]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;

    const payload = {
      name: form.name.trim(),
      unit: form.unit,
      // Unlike stock_quantity/min_stock_quantity below, a negative cost has
      // no valid meaning (it would understate every recipe's total cost and
      // overstate margin in /precios with no warning) — clamp to 0 here,
      // the one field in this form that IS floored.
      cost_per_unit: Math.max(0, Number(form.cost_per_unit) || 0),
      // Number("") is 0, not NaN — an intentionally blank field saves as 0,
      // not as a validation error. No clamping applied here — see the
      // component doc comment above.
      stock_quantity: Number(form.stock_quantity) || 0,
      min_stock_quantity: Number(form.min_stock_quantity) || 0,
      is_active: form.is_active,
    };

    try {
      if (supply) {
        await updateSupply.mutateAsync({ id: supply.id, ...payload });
      } else {
        await createSupply.mutateAsync(payload);
      }
      handleClose();
    } catch {
      /* react-query onError already surfaces the alert */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="ios-glass rounded-2xl">
        <DialogHeader>
          <DialogTitle>{supply ? "Editar insumo" : "Nuevo insumo"}</DialogTitle>
          <DialogDescription>
            {supply
              ? "Modificá los datos del insumo"
              : "Completá los datos para crear un nuevo insumo"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej: Harina 000"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Unidad</Label>
            <Select
              value={form.unit}
              onValueChange={(v) => setForm({ ...form, unit: v as SupplyUnit })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Costo por unidad</Label>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={form.cost_per_unit}
              onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })}
              placeholder="0.00"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Stock actual</Label>
              {/* NO min="0" — negative stock is allowed, see doc comment above. */}
              <Input
                type="number"
                value={form.stock_quantity}
                onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label>Stock mínimo</Label>
              <Input
                type="number"
                value={form.min_stock_quantity}
                onChange={(e) => setForm({ ...form, min_stock_quantity: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
            <Label>Activo</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button disabled={!form.name.trim() || isSaving} onClick={handleSubmit}>
            {supply ? "Guardar cambios" : "Crear insumo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
