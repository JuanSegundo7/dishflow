"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Customer } from "@/lib/types";

// ─── Queries ────────────────────────────────────────────────────────────────

export function useCustomers(search?: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["customers", search],
    queryFn: async () => {
      let query = supabase
        .from("customers")
        .select("*")
        .order("name", { ascending: true });

      if (search?.trim()) {
        query = query.or(
          `name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Customer[];
    },
  });
}

export function useCustomerAddresses(customerId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["customer-addresses", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("customer_id", customerId)
        .order("is_default", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useCreateCustomer() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      phone,
      address,
    }: {
      name: string;
      phone: string | null;
      address?: {
        label: string;
        address: string;
        notes: string | null;
      };
    }) => {
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .insert({ name, phone })
        .select()
        .single();

      if (customerError) throw customerError;

      if (address?.address) {
        const { error: addrError } = await supabase
          .from("customer_addresses")
          .insert({
            customer_id: customer.id,
            label: address.label,
            address: address.address,
            notes: address.notes,
            is_default: true,
          });

        if (addrError) throw addrError;
      }

      return customer as Customer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useUpdateCustomer() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      name,
      phone,
    }: {
      id: string;
      name: string;
      phone: string | null;
    }) => {
      const { data, error } = await supabase
        .from("customers")
        .update({ name, phone })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Customer;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
    },
  });
}

export function useDeleteCustomer() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customerId: string) => {
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", customerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}