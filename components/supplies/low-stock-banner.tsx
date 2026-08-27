"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Supply } from "@/lib/types";

interface LowStockBannerProps {
  supplies: Supply[];
}

/**
 * Purely informational — never blocks anything. Shows a single warning
 * banner listing every ACTIVE supply whose stock_quantity is below its
 * min_stock_quantity (negative stock included: a negative stock_quantity is
 * always < min_stock_quantity for any non-negative min, so it surfaces
 * here too, unless the admin also set a negative min — see
 * scripts/041-supplies-and-stock.sql for why stock can go negative by
 * design). Renders nothing when there's nothing to warn about.
 */
export function LowStockBanner({ supplies }: LowStockBannerProps) {
  const lowStockSupplies = supplies.filter(
    (s) => s.is_active && s.stock_quantity < s.min_stock_quantity,
  );

  if (lowStockSupplies.length === 0) return null;

  return (
    <Alert className="border-status-ready/40 bg-status-ready/10">
      <AlertTriangle className="text-status-ready" />
      <AlertTitle>
        {lowStockSupplies.length === 1
          ? "1 insumo con stock bajo"
          : `${lowStockSupplies.length} insumos con stock bajo`}
      </AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {lowStockSupplies.map((s) => (
            <li key={s.id}>
              {s.name}: {s.stock_quantity} {s.unit} (mínimo {s.min_stock_quantity} {s.unit})
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
