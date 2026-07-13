import { useState, useMemo } from "react";
import type { Customer } from "@/lib/types";

interface NewCustomerData {
  name: string;
  phone: string;
}

interface NewAddressData {
  label: string;
  address: string;
  notes: string;
}

export function useCustomerSelection() {
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState<NewCustomerData>({
    name: "",
    phone: "",
  });
  const [newAddressData, setNewAddressData] = useState<NewAddressData>({
    label: "Casa",
    address: "",
    notes: "",
  });
  const [selectedAddress, setSelectedAddress] = useState<string>();
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);

  const canProceed = useMemo(
    () => selectedCustomer || (isNewCustomer && newCustomerData.name.trim()),
    [selectedCustomer, isNewCustomer, newCustomerData.name],
  );

  const loadCustomerData = (data: {
    customerName: string;
    customerId: string | null;
    addressId: string | null;
    address: any;
  }) => {
    if (data.customerId) {
      setSelectedCustomer({
        id: data.customerId,
        name: data.customerName,
        phone: null,
        address: null,
        created_at: "",
      });
      if (data.addressId) {
        setSelectedAddress(data.addressId);
      }
    } else {
      setIsNewCustomer(true);
      setNewCustomerData({
        name: data.customerName,
        phone: "",
      });
      if (data.address) {
        setNewAddressData({
          label: data.address.label || "Principal",
          address: data.address.address || "",
          notes: data.address.notes || "",
        });
      }
    }
  };
  const reset = () => {
    setCustomerSearch("");
    setSelectedCustomer(null);
    setIsNewCustomer(false);
    setNewCustomerData({ name: "", phone: "" });
    setNewAddressData({ label: "Casa", address: "", notes: "" });
    setSelectedAddress(undefined);
    setIsEditingCustomer(false);
  };

  return {
    // State
    customerSearch,
    selectedCustomer,
    isNewCustomer,
    newCustomerData,
    newAddressData,
    selectedAddress,
    isEditingCustomer,

    // ActionsP
    setCustomerSearch,
    setSelectedCustomer,
    setIsNewCustomer,
    setNewCustomerData,
    setNewAddressData,
    setSelectedAddress,
    setIsEditingCustomer,
    loadCustomerData,
    // Computed
    canProceed,
    reset,
  };
}
