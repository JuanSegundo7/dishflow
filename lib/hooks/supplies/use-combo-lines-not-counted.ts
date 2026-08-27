"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * Cost/stock/finance porting, PR4 task 7a.10. Informational-only count of
 * combo order_items lines across every completed order — i.e. lines that
 * lib/services/stock-deduction.ts's buildStockDeductionPlan always resolves
 * to `skipped` (reason "no-recipe") in this PR (Group 7a; combo-slot
 * deduction is 7b/PR5's job, a separate later PR).
 *
 * DELIBERATE SCOPE NOTE: there is no persisted table of "skipped" plan
 * entries anywhere (order_stock_movements, scripts/044-order-stock-
 * movements.sql, only ever records lines that WERE deducted) — plumbing one
 * through just to drive this one informational note would be
 * disproportionate to what the note needs. This hook instead re-derives
 * the same fact directly from order_items/orders — "how many combo lines
 * exist across completed orders" — which is exactly what would have landed
 * in `skipped` had every one of those completions been re-run through
 * buildStockDeductionPlan today. See app/(dashboard)/insumos/page.tsx for
 * where this is surfaced.
 */
export function useComboLinesNotCounted() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["combo-lines-not-counted"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("order_items")
        .select("id, orders!inner(status)", { count: "exact", head: true })
        .eq("kind", "combo")
        .eq("orders.status", "completed");

      if (error) throw error;
      return count ?? 0;
    },
  });
}
