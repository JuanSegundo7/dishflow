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
    },
  });
}
