"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "../supabase/client";

interface CreateCustomerInput {
  name: string;
  phone?: string | null;
  address?: {
    label: string;
    address: string;
    notes: string | null;
  };
}

/* =========================
   Addresses
========================= */
export function useCustomers(search?: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["customers", search],
    queryFn: async () => {
      let query = supabase
        .from("customers")
        .select("*")
        .order("name", { ascending: true }); // alfabético

      if (search?.trim()) {
        query = query.or(
          `name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCustomer() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCustomerInput) => {
      const { data, error } = await supabase
        .from("customers")
        .insert({ name: input.name, phone: input.phone ?? null })
        .select()
        .single();

      if (error) throw error;

      // Si viene con dirección, la crea también
      if (input.address?.address) {
        const { error: addrError } = await supabase
          .from("customer_addresses")
          .insert({
            customer_id: data.id,
            label: input.address.label || "Principal",
            address: input.address.address,
            notes: input.address.notes ?? null,
            is_default: true,
          });

        if (addrError) throw addrError;
      }

      return data;
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useCustomerAddresses(customerId?: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["customer-addresses", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCustomerAddress() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      customerId: string;
      address: string;
      label?: string;
      notes?: string;
      is_default?: boolean;
    }) => {
      const { data: address, error } = await supabase
        .from("customer_addresses")
        .insert({
          customer_id: data.customerId,
          address: data.address,
          label: data.label ?? "Principal",
          notes: data.notes ?? null,
          is_default: data.is_default ?? false,
        })
        .select()
        .single();

      if (error) throw error;
      return address;
    },

    // 🔥 optimistic update
    onMutate: async (newAddress) => {
      await qc.cancelQueries({
        queryKey: ["customer-addresses", newAddress.customerId],
      });

      const prev =
        qc.getQueryData<any[]>(["customer-addresses", newAddress.customerId]) ??
        [];

      qc.setQueryData<any[]>(
        ["customer-addresses", newAddress.customerId],
        [
          ...prev,
          {
            id: "optimistic-" + crypto.randomUUID(),
            customer_id: newAddress.customerId,
            address: newAddress.address,
            label: newAddress.label ?? "Principal",
            notes: newAddress.notes,
            is_default: newAddress.is_default ?? prev.length === 0,
            _optimistic: true,
          },
        ],
      );

      return { prev };
    },

    onError: (_err, vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(["customer-addresses", vars.customerId], ctx.prev);
      }
    },

    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({
        queryKey: ["customer-addresses", vars.customerId],
      });
    },
  });
}

export function useDeleteCustomerAddress(customerId: string) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (addressId: string) => {
      const { error } = await supabase
        .from("customer_addresses")
        .delete()
        .eq("id", addressId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["customer-addresses", customerId],
      });
    },
  });
}

export function useSetDefaultAddress() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      customerId,
      addressId,
    }: {
      customerId: string;
      addressId: string;
    }) => {
      await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("customer_id", customerId);

      await supabase
        .from("customer_addresses")
        .update({ is_default: true })
        .eq("id", addressId);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: ["customer-addresses", vars.customerId],
      });
    },
  });
}

export function useUpdateCustomer(customerId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; phone?: string }) => {
      const { error } = await supabase
        .from("customers")
        .update({
          name: data.name,
          phone: data.phone,
        })
        .eq("id", customerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
