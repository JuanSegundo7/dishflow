"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Burger, Extra, Customer } from "@/lib/types";

export function useBurgers() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["burgers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("burgers")
        .select("*")
        .eq("is_available", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return data as Burger[];
    },
  });
}

export function useExtras() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["extras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extras")
        .select("*")
        .eq("is_available", true)
        .order("category", { ascending: true });

      if (error) throw error;
      return data as Extra[];
    },
  });
}

export function useCustomers() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      return data as Customer[];
    },
  });
}
