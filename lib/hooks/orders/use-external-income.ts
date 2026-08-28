"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ExternalIncome } from "@/lib/types";

function queryKey(startDate: string, endDate: string) {
  return ["external-income", startDate, endDate];
}

export function useExternalIncome(startDate: string, endDate: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKey(startDate, endDate),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_income")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });

      if (error) throw error;
      return data as ExternalIncome[];
    },
  });
}

export function useCreateExternalIncome(startDate: string, endDate: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      date: string;
      amount: number;
      description: string | null;
      // Cost/stock/finance porting, PR3: which sales channel this manual
      // income entry belongs to (see lib/utils/commission.ts's
      // getOrderSources() — same operator-configured source list the order
      // wizard already uses). Column added by PR2's migration
      // (scripts/043), wired up here in PR3. Null = no channel tagged.
      source?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("external_income")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as ExternalIncome;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey(startDate, endDate) });
      queryClient.invalidateQueries({ queryKey: ["orders-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["revenue-by-source"] });
    },
  });
}

export function useDeleteExternalIncome(startDate: string, endDate: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("external_income")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey(startDate, endDate) });
      queryClient.invalidateQueries({ queryKey: ["orders-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["revenue-by-source"] });
    },
  });
}
