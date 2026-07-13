"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useCreateAddress() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      customerId,
      label,
      address,
      notes,
      is_default,
    }: {
      customerId: string;
      label: string | null;
      address: string;
      notes: string | null;
      is_default: boolean;
    }) => {
      // If setting as default, unset others first
      if (is_default) {
        await supabase
          .from("customer_addresses")
          .update({ is_default: false })
          .eq("customer_id", customerId);
      }

      const { error } = await supabase.from("customer_addresses").insert({
        customer_id: customerId,
        label,
        address,
        notes,
        is_default,
      });

      if (error) throw error;
    },
    onSuccess: (_data, { customerId }) => {
      queryClient.invalidateQueries({
        queryKey: ["customer-addresses", customerId],
      });
    },
  });
}

export function useUpdateAddress() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      addressId,
      customerId,
      label,
      address,
      notes,
      is_default,
    }: {
      addressId: string;
      customerId: string;
      label: string | null;
      address: string;
      notes: string | null;
      is_default: boolean;
    }) => {
      // If setting as default, unset others first
      if (is_default) {
        await supabase
          .from("customer_addresses")
          .update({ is_default: false })
          .eq("customer_id", customerId)
          .neq("id", addressId);
      }

      const { error } = await supabase
        .from("customer_addresses")
        .update({ label, address, notes, is_default })
        .eq("id", addressId);

      if (error) throw error;
    },
    onSuccess: (_data, { customerId }) => {
      queryClient.invalidateQueries({
        queryKey: ["customer-addresses", customerId],
      });
    },
  });
}

export function useDeleteAddress() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      addressId,
      customerId: _customerId,
    }: {
      addressId: string;
      customerId: string;
    }) => {
      const { error } = await supabase
        .from("customer_addresses")
        .delete()
        .eq("id", addressId);

      if (error) throw error;
    },
    onSuccess: (_data, { customerId }) => {
      queryClient.invalidateQueries({
        queryKey: ["customer-addresses", customerId],
      });
    },
  });
}

export function useSetDefaultAddress() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      addressId,
      customerId,
    }: {
      addressId: string;
      customerId: string;
    }) => {
      // Unset all defaults for this customer
      await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("customer_id", customerId);

      // Set the new default
      const { error } = await supabase
        .from("customer_addresses")
        .update({ is_default: true })
        .eq("id", addressId);

      if (error) throw error;
    },
    onSuccess: (_data, { customerId }) => {
      queryClient.invalidateQueries({
        queryKey: ["customer-addresses", customerId],
      });
    },
  });
}