"use client";

import { useState, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MapPin,
  Minus,
  Phone,
  Plus,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useBurgers, useExtras, useCustomers } from "@/lib/hooks/use-menu";
import {
  useCreateOrder,
  type OrderItemInput,
} from "@/lib/hooks/orders/use-create-order";
import type { Customer, Burger, Extra } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { CustomerAddressSelect } from "./customer-adress-select";
import { EditCustomerModal } from "./edit/edit-customer-modal";
import {
  useCreateCustomer,
  useCreateCustomerAddress,
  useCustomerAddresses,
} from "@/lib/hooks/use-customers";
import { nanoid } from "nanoid";
import { useAllCombos } from "@/lib/hooks/use-combos";
import { Combo, ComboSlotRule, ComboWithSlots } from "@/lib/types/combo";
import { SelectedBurgerCard } from "./burger-item-card";
import { useComboSelection } from "../order-wizard/hooks/use-combo-selection";
interface OrderWizardDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WizardStep = "customer" | "combos" | "burgers" | "summary";

interface SelectedBurger {
  id: string; // 👈 ID ÚNICO DEL ITEM
  burger: Burger;
  quantity: number; // opcional, puede ser siempre 1
  customizations: string;
  meatPriceAdjustment: number;
  meatCount: number;
  removedIngredients: string[];
  selectedExtras: { extra: Extra; quantity: number }[];
}

export function OrderWizardDrawer({
  open,
  onOpenChange,
}: OrderWizardDrawerProps) {
  const {
    selectedCombos,
    expandedBurgerId,
    addCombo,
    addBurgerToSlot,
    getRemainingQuantity,
    canAddBurgerToSlot,
    increaseBurgerQty,
    decreaseBurgerQty,
    updateBurgerMeat,
    removeBurgerFromSlot,
    toggleComboBurgerIngredient,
    toggleComboBurgerExtra,
    updateComboBurgerExtraQty,
    toggleBurgerExpanded,
    resetState: resetComboState,
  } = useComboSelection();

  const [step, setStep] = useState<WizardStep>("customer");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );

  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    name: "",
    phone: "",
  });

  const [newAddressData, setNewAddressData] = useState({
    label: "Casa",
    address: "",
    notes: "",
  });
  const [selectedBurgers, setSelectedBurgers] = useState<SelectedBurger[]>([]);
  const [notes, setNotes] = useState("");
  const [expandedBurger, setExpandedBurger] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string>();

  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editedCustomerData, setEditedCustomerData] = useState({
    name: "",
    address: "",
    phone: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">(
    "cash",
  );

  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">(
    "pickup",
  );
  const [deliveryFee, setDeliveryFee] = useState(2000);

  const { data: combos } = useAllCombos();

  const { data: customers } = useCustomers();
  const { data: burgers } = useBurgers();
  const { data: extras } = useExtras();
  const { data: customerAddresses, isLoading: isLoadingAddresses } =
    useCustomerAddresses(selectedCustomer?.id);

  const createOrder = useCreateOrder();
  const createCustomer = useCreateCustomer();
  const createCustomerAddress = useCreateCustomerAddress();

  const filteredCustomers = useMemo(() => {
    if (!customers || !customerSearch) return customers || [];

    const search = customerSearch.toLowerCase();

    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(search) ||
        c.phone?.includes(customerSearch),
    );
  }, [customers, customerSearch]);

  const extrasByCategory = useMemo(() => {
    if (!extras) return {};
    return extras.reduce(
      (acc, extra) => {
        if (!acc[extra.category]) acc[extra.category] = [];
        acc[extra.category].push(extra);
        return acc;
      },
      {} as Record<string, Extra[]>,
    );
  }, [extras]);

  const selectedAddressObj = useMemo(() => {
    if (!customerAddresses || !selectedAddress) return null;

    return customerAddresses.find((addr) => addr.id === selectedAddress);
  }, [customerAddresses, selectedAddress]);

  /* ===================== EXTRAS ===================== */

  const meatExtra = useMemo(
    () => extras?.find((e) => e.name === "Medallón extra"),
    [extras],
  );

  const extrasTotal = useMemo(
    () =>
      selectedBurgers.reduce(
        (acc, item) =>
          acc +
          item.selectedExtras.reduce(
            (extAcc, ext) => extAcc + ext.extra.price * ext.quantity,
            0,
          ),
        0,
      ),
    [selectedBurgers],
  );

  /* ===================== TOTAL ===================== */

  const orderTotal = useMemo(() => {
    const burgersTotal = selectedBurgers.reduce((total, item) => {
      const burgerTotal =
        (item.burger.base_price + item.meatPriceAdjustment) * item.quantity;

      const extrasTotal = item.selectedExtras.reduce(
        (acc, ext) => acc + ext.extra.price * ext.quantity,
        0,
      );

      return total + burgerTotal + extrasTotal;
    }, 0);

    const combosTotal = selectedCombos.reduce((comboAcc, c) => {
      const comboBasePrice = c.combo.price * c.quantity;

      // Calcular extras y ajustes de carne de las hamburguesas del combo
      const comboExtrasAndMeat = c.slots.reduce((slotAcc, slot) => {
        const slotExtrasAndMeat = slot.burgers.reduce((burgerAcc, burger) => {
          // Extras
          const burgerExtras = burger.selectedExtras.reduce(
            (extAcc, ext) => extAcc + ext.extra.price * ext.quantity,
            0,
          );

          // Ajuste de carne
          let meatAdjustment = 0;
          if (meatExtra) {
            const meatDiff =
              burger.meatCount - burger.burger.default_meat_quantity;
            meatAdjustment = meatDiff * meatExtra.price;
          }

          return burgerAcc + (burgerExtras + meatAdjustment) * burger.quantity;
        }, 0);

        return slotAcc + slotExtrasAndMeat;
      }, 0);

      return comboAcc + comboBasePrice + comboExtrasAndMeat;
    }, 0);

    const itemsTotal = burgersTotal + combosTotal;

    if (deliveryType === "delivery") {
      return itemsTotal + deliveryFee;
    }

    return itemsTotal;
  }, [selectedBurgers, selectedCombos, deliveryType, deliveryFee, meatExtra]);

  const resetWizard = () => {
    setStep("customer");

    // customer
    setCustomerSearch("");
    setSelectedCustomer(null);
    setIsNewCustomer(false);
    setNewCustomerData({ name: "", phone: "" });
    setEditedCustomerData({ name: "", phone: "", address: "" });

    // addresses
    setSelectedAddress(undefined);
    setNewAddressData({ label: "Casa", address: "", notes: "" });

    // order
    setSelectedBurgers([]);
    setNotes("");
    setExpandedBurger(null);

    // combos (usa el reset del hook)
    resetComboState();

    // delivery
    setDeliveryType("pickup");
    setDeliveryFee(2000);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      resetWizard();
    }
    onOpenChange(open);
  };

  const handleAddBurger = (burger: Burger) => {
    setSelectedBurgers((prev) => [
      ...prev,
      {
        id: nanoid(), // 👈 item único
        burger,
        quantity: 1,
        meatCount: burger.default_meat_quantity,
        meatPriceAdjustment: 0,
        customizations: "",
        removedIngredients: [],
        selectedExtras: [],
      },
    ]);
  };

  const handleRemoveBurger = (itemId: string) => {
    setSelectedBurgers((prev) => prev.filter((b) => b.id !== itemId));
  };

  const handleUpdateQuantity = (itemId: string, delta: number) => {
    setSelectedBurgers((prev) =>
      prev.map((b) =>
        b.id === itemId
          ? { ...b, quantity: Math.max(1, b.quantity + delta) }
          : b,
      ),
    );
  };

  const handleToggleIngredient = (itemId: string, ingredient: string) => {
    setSelectedBurgers((prev) =>
      prev.map((b) =>
        b.id === itemId
          ? {
              ...b,
              removedIngredients: b.removedIngredients.includes(ingredient)
                ? b.removedIngredients.filter((i) => i !== ingredient)
                : [...b.removedIngredients, ingredient],
            }
          : b,
      ),
    );
  };

  const handleToggleExtra = (itemId: string, extra: Extra) => {
    setSelectedBurgers((prev) =>
      prev.map((b) =>
        b.id === itemId
          ? {
              ...b,
              selectedExtras: b.selectedExtras.some(
                (e) => e.extra.id === extra.id,
              )
                ? b.selectedExtras.filter((e) => e.extra.id !== extra.id)
                : [...b.selectedExtras, { extra, quantity: 1 }],
            }
          : b,
      ),
    );
  };

  const handleUpdateExtraQuantity = (
    burgerId: string,
    extraId: string,
    delta: number,
  ) => {
    setSelectedBurgers((prev) =>
      prev.map((b) => {
        if (b.burger.id === burgerId) {
          return {
            ...b,
            selectedExtras: b.selectedExtras
              .map((e) => {
                if (e.extra.id === extraId) {
                  const newQty = Math.max(0, e.quantity + delta);
                  return { ...e, quantity: newQty };
                }
                return e;
              })
              .filter((e) => e.quantity > 0),
          };
        }
        return b;
      }),
    );
  };

  const handleSubmit = async () => {
    const comboItems: OrderItemInput[] = selectedCombos.map((c) => {
      // Calcular el subtotal incluyendo extras y ajustes de carne
      let comboSubtotal = c.combo.price * c.quantity;

      c.slots.forEach((slot) => {
        slot.burgers.forEach((burger) => {
          // Sumar extras
          const burgerExtras = burger.selectedExtras.reduce(
            (acc, ext) => acc + ext.extra.price * ext.quantity,
            0,
          );

          // Sumar ajuste de carne
          let meatAdjustment = 0;
          if (meatExtra) {
            const meatDiff =
              burger.meatCount - burger.burger.default_meat_quantity;
            meatAdjustment = meatDiff * meatExtra.price;
          }

          comboSubtotal += (burgerExtras + meatAdjustment) * burger.quantity;
        });
      });

      return {
        burger_id: `combo-${c.combo.id}`,
        burger_name: c.combo.name,
        quantity: c.quantity,
        unit_price: c.combo.price,
        subtotal: comboSubtotal,
        customizations: JSON.stringify(
          c.slots.map((s) => ({
            slotId: s.slotId,
            burgers: s.burgers.map((b) => ({
              burgerId: b.burger.id,
              name: b.burger.name,
              meatCount: b.meatCount,
              quantity: b.quantity,
              removedIngredients: b.removedIngredients,
              extras: b.selectedExtras.map((ext) => ({
                id: ext.extra.id,
                name: ext.extra.name,
                quantity: ext.quantity,
                price: ext.extra.price,
              })),
            })),
          })),
        ),
      };
    });

    // 1️⃣ build items
    const items: OrderItemInput[] = [
      ...comboItems,
      ...selectedBurgers.map((item) => {
        const unitPrice = item.burger.base_price + item.meatPriceAdjustment;

        return {
          burger_id: item.id,
          burger_name: item.burger.name,
          quantity: item.quantity,
          unit_price: unitPrice,
          subtotal: unitPrice * item.quantity,
          customizations:
            item.removedIngredients.length > 0
              ? `Sin: ${item.removedIngredients.join(", ")}`
              : undefined,
          extras: item.selectedExtras.map((ext) => ({
            extra_id: ext.extra.id,
            extra_name: ext.extra.name,
            quantity: ext.quantity,
            unit_price: ext.extra.price,
            subtotal: ext.extra.price * ext.quantity,
          })),
        };
      }),
    ];
    let customerId = selectedCustomer?.id;
    let customerAddressId = selectedAddress;

    // 2️⃣ create customer if needed
    if (!customerId) {
      const customer = await createCustomer.mutateAsync({
        name: newCustomerData.name,
        phone: newCustomerData.phone,
      });

      customerId = customer.id;
    }

    // 3️⃣ create address if needed
    if (!customerAddressId && deliveryType === "delivery") {
      const address = await createCustomerAddress.mutateAsync({
        customerId,
        address: newAddressData.address,
        label: newAddressData.label ?? "Principal",
        notes: newAddressData.notes,
        is_default: true,
      });

      customerAddressId = address.id;
    }

    // 4️⃣ create order
    await createOrder.mutateAsync({
      customer_id: customerId,
      customer_name: selectedCustomer?.name ?? newCustomerData.name,
      customer_address_id: customerAddressId,
      delivery_type: deliveryType,
      delivery_fee: deliveryType === "delivery" ? deliveryFee : 0,
      payment_method: paymentMethod,
      items,
      notes: notes || undefined,
    });

    handleClose(false);
  };

  const canProceedFromCustomer =
    selectedCustomer || (isNewCustomer && newCustomerData.name.trim());
  const canProceedFromBurgers =
    selectedBurgers.length > 0 || selectedCombos.length > 0;

  const steps = [
    { key: "customer", label: "Cliente" },
    { key: "combos", label: "Combos" },
    { key: "burgers", label: "Hamburguesas" },
    { key: "summary", label: "Resumen" },
  ];

  const handleUpdateMeatCount = (itemId: string, delta: number) => {
    if (!meatExtra) return;

    setSelectedBurgers((prev) =>
      prev.map((b) => {
        if (b.id !== itemId) return b;

        const newMeatCount = Math.max(1, b.meatCount + delta);
        const baseMeat = b.burger.default_meat_quantity;
        const diff = newMeatCount - baseMeat;

        return {
          ...b,
          meatCount: newMeatCount,
          meatPriceAdjustment: diff * meatExtra.price,
        };
      }),
    );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent
          side="right"
          className="flex h-full w-full max-w-2xl flex-col p-0 sm:max-w-2xl"
        >
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle className="text-lg">Crear Pedido</SheetTitle>
            <div className="flex items-center gap-2 pt-2">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
                      step === s.key
                        ? "bg-primary text-primary-foreground"
                        : steps.findIndex((x) => x.key === step) > i
                          ? "bg-green-500 text-white"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {steps.findIndex((x) => x.key === step) > i ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className="ml-2 text-sm">{s.label}</span>
                  {i < steps.length - 1 && (
                    <div className="mx-3 h-px w-8 bg-border" />
                  )}
                </div>
              ))}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              {step === "customer" && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      variant={!isNewCustomer ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setIsNewCustomer(false)}
                    >
                      <User className="mr-2 h-4 w-4" />
                      Existente
                    </Button>
                    <Button
                      variant={isNewCustomer ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setIsNewCustomer(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Nuevo
                    </Button>
                  </div>

                  {!isNewCustomer ? (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Buscar por nombre, teléfono o dirección..."
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>

                      <div className="space-y-4">
                        {filteredCustomers.slice(0, 10).map((customer) => {
                          const isSelected =
                            selectedCustomer?.id === customer.id;

                          console.log(customer, "customer");

                          return (
                            <Card
                              key={customer.id}
                              className={cn(
                                "cursor-pointer transition-all hover:shadow-sm",
                                isSelected && "ring-2 ring-primary",
                              )}
                              onClick={() => setSelectedCustomer(customer)}
                            >
                              <CardContent className="p-4 space-y-2">
                                {/* Header */}
                                <div className="flex justify-between items-start">
                                  <p className="font-medium">
                                    Nombre: {customer.name}
                                  </p>

                                  {isSelected && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setIsEditingCustomer(true);
                                        setEditedCustomerData({
                                          name: customer.name,
                                          phone: customer.phone ?? "",
                                        });
                                      }}
                                    >
                                      ✏️ Editar
                                    </Button>
                                  )}
                                </div>
                                {customer.phone && (
                                  <p className="text-sm text-muted-foreground">
                                    Telefóno: {customer.phone}
                                  </p>
                                )}

                                {/* Address selector SOLO si está seleccionado */}
                                {isSelected && (
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm text-muted-foreground">
                                      Direcciones:
                                    </p>
                                    <CustomerAddressSelect
                                      customerId={customer.id}
                                      value={selectedAddress}
                                      onChange={setSelectedAddress}
                                      isLoading={isLoadingAddresses}
                                    />
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Nombre *</Label>
                        <Input
                          value={newCustomerData.name}
                          onChange={(e) =>
                            setNewCustomerData((p) => ({
                              ...p,
                              name: e.target.value,
                            }))
                          }
                          placeholder="Ej: Jeremías"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Teléfono</Label>
                        <Input
                          value={newCustomerData.phone}
                          onChange={(e) =>
                            setNewCustomerData((p) => ({
                              ...p,
                              phone: e.target.value,
                            }))
                          }
                          placeholder="Ej: 221 123-456"
                        />
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label>Nombre de la dirección</Label>
                        <Input
                          value={newAddressData.label}
                          onChange={(e) =>
                            setNewAddressData((p) => ({
                              ...p,
                              label: e.target.value,
                            }))
                          }
                          placeholder="Ej: Casa"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Dirección</Label>
                        <Input
                          value={newAddressData.address}
                          onChange={(e) =>
                            setNewAddressData((p) => ({
                              ...p,
                              address: e.target.value,
                            }))
                          }
                          placeholder="Solo completar si es para envío a domicilio"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Notas de la dirección</Label>
                        <Textarea
                          value={newAddressData.notes}
                          onChange={(e) =>
                            setNewAddressData((p) => ({
                              ...p,
                              notes: e.target.value,
                            }))
                          }
                          rows={2}
                          className="bg-white"
                          placeholder="Solo completar si es para envío a domicilio"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === "combos" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium mb-3">
                      Combos disponibles (opcional)
                    </h3>

                    <div className="grid grid-cols-2 gap-3">
                      {combos
                        ?.filter((c) => c.is_available)
                        .map((combo) => (
                          <Card
                            key={combo.id}
                            className="cursor-pointer hover:shadow-sm"
                            onClick={() => addCombo(combo)}
                          >
                            <CardContent className="p-3">
                              <p className="font-medium">{combo.name}</p>
                              <p className="text-sm font-semibold text-primary">
                                {formatCurrency(combo.price)}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  </div>

                  {selectedCombos.map((comboInstance) =>
                    comboInstance.slots
                      .filter((s) => s.slotType === "burger")
                      .map((slot) => {
                        const remaining = getRemainingQuantity(
                          comboInstance.id,
                          slot.slotId,
                        );

                        console.log(
                          comboInstance,
                          "comboInstance",
                          remaining,
                          "remaining",
                        );

                        return (
                          <Card key={slot.slotId}>
                            <CardContent className="space-y-3 p-4">
                              <h4 className="font-medium">
                                {comboInstance.combo.name} – Hamburguesas (
                                {remaining} disponibles)
                              </h4>

                              {/* SELECCIONADAS */}
                              <div className="space-y-2">
                                {slot.burgers.map((item) => (
                                  <SelectedBurgerCard
                                    key={item.id}
                                    item={item}
                                    /* === estado UI === */
                                    expanded={expandedBurgerId === item.id}
                                    meatExtra={meatExtra}
                                    extrasByCategory={extrasByCategory}
                                    baseMeatCount={slot.defaultMeatCount} // 🆕 pasar el default_meat_quantity del slot
                                    onToggleExpand={() =>
                                      toggleBurgerExpanded(item.id)
                                    }
                                    /* === cantidad === */
                                    onUpdateQuantity={(d) =>
                                      d > 0
                                        ? increaseBurgerQty(
                                            comboInstance.id,
                                            slot.slotId,
                                            item.id,
                                          )
                                        : decreaseBurgerQty(
                                            comboInstance.id,
                                            slot.slotId,
                                            item.id,
                                          )
                                    }
                                    /* === carne === */
                                    onUpdateMeatCount={(d) =>
                                      updateBurgerMeat(
                                        comboInstance.id,
                                        slot.slotId,
                                        item.id,
                                        item.meatCount + d,
                                      )
                                    }
                                    /* === ingredientes === */
                                    onToggleIngredient={(ingredient) =>
                                      toggleComboBurgerIngredient(
                                        comboInstance.id,
                                        slot.slotId,
                                        item.id,
                                        ingredient,
                                      )
                                    }
                                    /* === extras === */
                                    onToggleExtra={(extra) =>
                                      toggleComboBurgerExtra(
                                        comboInstance.id,
                                        slot.slotId,
                                        item.id,
                                        extra,
                                      )
                                    }
                                    onUpdateExtraQuantity={(extraId, d) =>
                                      updateComboBurgerExtraQty(
                                        comboInstance.id,
                                        slot.slotId,
                                        item.id,
                                        extraId,
                                        d,
                                      )
                                    }
                                    /* === eliminar === */
                                    onRemove={() =>
                                      removeBurgerFromSlot(
                                        comboInstance.id,
                                        slot.slotId,
                                        item.id,
                                      )
                                    }
                                  />
                                ))}
                              </div>

                              {/* SELECTOR */}
                              {remaining > 0 && (
                                <div className="grid grid-cols-2 gap-2">
                                  {burgers?.map((burger) =>
                                    canAddBurgerToSlot(
                                      comboInstance.id,
                                      slot.slotId,
                                      burger,
                                    ) ? (
                                      <Card
                                        key={burger.id}
                                        className="cursor-pointer hover:shadow-sm"
                                        onClick={() =>
                                          addBurgerToSlot(
                                            comboInstance.id,
                                            slot.slotId,
                                            burger,
                                          )
                                        }
                                      >
                                        <CardContent className="p-3">
                                          <p className="font-medium">
                                            {burger.name}
                                          </p>
                                          <p className="text-sm text-muted-foreground">
                                            {formatCurrency(burger.base_price)}
                                          </p>
                                        </CardContent>
                                      </Card>
                                    ) : null,
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      }),
                  )}
                </div>
              )}

              {step === "burgers" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-3 text-sm font-medium">
                      Seleccionar hamburguesas
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {burgers?.map((burger) => (
                        <Card
                          key={burger.id}
                          className="cursor-pointer transition-all hover:shadow-sm"
                          onClick={() => handleAddBurger(burger)}
                        >
                          <CardContent className="p-3">
                            <p className="font-medium">{burger.name}</p>
                            <p className="text-sm font-semibold text-primary">
                              {formatCurrency(burger.base_price)}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {selectedBurgers.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="mb-3 text-sm font-medium">
                          Tu pedido ({selectedBurgers.length} items)
                        </h3>
                        <div className="space-y-3">
                          {selectedBurgers.map((item) => (
                            <SelectedBurgerCard
                              key={item.id}
                              item={item}
                              expanded={expandedBurger === item.id}
                              meatExtra={meatExtra}
                              extrasByCategory={extrasByCategory}
                              onToggleExpand={() =>
                                setExpandedBurger(
                                  expandedBurger === item.id ? null : item.id,
                                )
                              }
                              onUpdateQuantity={(d) =>
                                handleUpdateQuantity(item.id, d)
                              }
                              onRemove={() => handleRemoveBurger(item.id)}
                              onToggleIngredient={(ing) =>
                                handleToggleIngredient(item.id, ing)
                              }
                              onUpdateMeatCount={(d) =>
                                handleUpdateMeatCount(item.id, d)
                              }
                              onToggleExtra={(extra) =>
                                handleToggleExtra(item.id, extra)
                              }
                              onUpdateExtraQuantity={(extraId, d) =>
                                handleUpdateExtraQuantity(item.id, extraId, d)
                              }
                            />
                          ))}
                        </div>
                        {/* Fade inferior */}
                        <div className="pointer-events-none absolute bottom-0 left-0 h-8 w-full bg-linear-to-t from-background to-transparent" />
                      </div>
                    </>
                  )}
                </div>
              )}

              {step === "summary" && (
                <div className="space-y-6">
                  {/* ================= CLIENTE ================= */}
                  <Card>
                    <CardContent className="p-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm space-y-2">
                        {/* Nombre */}
                        <div className=" font-medium flex items-center gap-2 ">
                          <h3 className="flex items-center gap-2 text-sm font-medium">
                            <User className="h-4 w-4 text-muted-foreground" />
                            Cliente
                          </h3>
                          {isNewCustomer
                            ? newCustomerData.name
                            : selectedCustomer?.name}
                        </div>

                        {/* Dirección */}
                        {(isNewCustomer || selectedAddressObj) && (
                          <div className="flex items-start gap-2">
                            <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            <div className="">
                              <p className="font-medium">
                                {isNewCustomer
                                  ? `${newAddressData.label}: ${newAddressData.address}`
                                  : `${selectedAddressObj.label}: ${selectedAddressObj.address}`}
                              </p>

                              {(isNewCustomer
                                ? newAddressData.notes
                                : selectedAddressObj.notes) && (
                                <p className="text-xs text-muted-foreground italic absolute">
                                  {" "}
                                  Nota:
                                  {isNewCustomer
                                    ? newAddressData.notes
                                    : selectedAddressObj.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Teléfono */}
                        {(isNewCustomer
                          ? newCustomerData.phone
                          : selectedCustomer?.phone) && (
                          <div className="flex items-center gap-2">
                            <h3 className="flex items-center gap-2 text-sm font-medium">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              Telefono
                            </h3>
                            <span>
                              {isNewCustomer
                                ? newCustomerData.phone
                                : selectedCustomer?.phone}
                            </span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* ================= PAGO ================= */}
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <h3 className="text-sm font-medium">Método de pago</h3>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          className="flex-1"
                          variant={
                            paymentMethod === "cash" ? "default" : "outline"
                          }
                          onClick={() => setPaymentMethod("cash")}
                        >
                          💵 Efectivo
                        </Button>

                        <Button
                          type="button"
                          className="flex-1"
                          variant={
                            paymentMethod === "transfer" ? "default" : "outline"
                          }
                          onClick={() => setPaymentMethod("transfer")}
                        >
                          🏦 Transferencia
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* ================= ENTREGA ================= */}
                  <Card>
                    <CardContent className="p-4 space-y-4">
                      <h3 className="text-sm font-medium">Entrega</h3>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          className="flex-1"
                          variant={
                            deliveryType === "pickup" ? "default" : "outline"
                          }
                          onClick={() => setDeliveryType("pickup")}
                        >
                          🏃 Retiro
                        </Button>

                        <Button
                          type="button"
                          className="flex-1"
                          variant={
                            deliveryType === "delivery" ? "default" : "outline"
                          }
                          onClick={() => setDeliveryType("delivery")}
                        >
                          🛵 Envío
                        </Button>
                      </div>

                      {deliveryType === "delivery" && (
                        <div className="space-y-1">
                          <Label>Costo de envío</Label>
                          <Input
                            type="number"
                            min={0}
                            value={deliveryFee}
                            onChange={(e) =>
                              setDeliveryFee(Number(e.target.value))
                            }
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* ================= PEDIDO ================= */}
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="mb-3 text-sm font-medium">Pedido</h3>

                      <div className="space-y-3">
                        {selectedBurgers.map((item) => {
                          const baseMeat = item.burger.default_meat_quantity;
                          const diffMeat = item.meatCount - baseMeat;

                          const sizeLabel =
                            item.meatCount === baseMeat
                              ? "Doble"
                              : item.meatCount < baseMeat
                                ? "Simple"
                                : item.meatCount === baseMeat + 1
                                  ? "Triple"
                                  : `${item.meatCount} carnes`;

                          return (
                            <div
                              key={item.id}
                              className="border-b pb-3 last:border-0"
                            >
                              <div className="flex justify-between">
                                {/* COLUMNA IZQUIERDA */}
                                <div>
                                  <p className="font-medium">
                                    {item.quantity}x {item.burger.name}{" "}
                                    <span className="text-xs text-muted-foreground">
                                      ({sizeLabel})
                                    </span>
                                  </p>

                                  {/* Medallón quitado */}
                                  {diffMeat < 0 && meatExtra && (
                                    <p className="text-xs text-muted-foreground">
                                      – {Math.abs(diffMeat)}x Medallón
                                    </p>
                                  )}

                                  {/* Medallón extra */}
                                  {diffMeat > 0 && meatExtra && (
                                    <p className="text-xs text-muted-foreground">
                                      + {diffMeat}x Medallón extra
                                    </p>
                                  )}

                                  {item.removedIngredients.length > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                      Sin: {item.removedIngredients.join(", ")}
                                    </p>
                                  )}

                                  {item.selectedExtras.map((ext) => (
                                    <p
                                      key={ext.extra.id}
                                      className="text-xs text-muted-foreground"
                                    >
                                      + {ext.quantity}x {ext.extra.name}
                                    </p>
                                  ))}
                                </div>

                                {/* COLUMNA DERECHA */}
                                <div className="flex flex-col items-end">
                                  {/* Precio base */}
                                  <span className="font-semibold">
                                    {formatCurrency(
                                      item.burger.base_price * item.quantity,
                                    )}
                                  </span>

                                  {/* Ajuste por medallón (abajo del precio base) */}
                                  {diffMeat !== 0 && meatExtra && (
                                    <span className="text-xs italic text-muted-foreground">
                                      (
                                      {formatCurrency(
                                        diffMeat *
                                          meatExtra.price *
                                          item.quantity,
                                      )}
                                      )
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <Separator className="my-3" />

                      {selectedCombos.map((c) => {
                        // Calcular total de extras y ajustes para este combo
                        let comboExtrasTotal = 0;
                        c.slots.forEach((slot) => {
                          slot.burgers.forEach((burger) => {
                            const burgerExtras = burger.selectedExtras.reduce(
                              (acc, ext) =>
                                acc + ext.extra.price * ext.quantity,
                              0,
                            );
                            let meatAdjustment = 0;
                            if (meatExtra) {
                              const meatDiff =
                                burger.meatCount -
                                burger.burger.default_meat_quantity;
                              meatAdjustment = meatDiff * meatExtra.price;
                            }
                            comboExtrasTotal +=
                              (burgerExtras + meatAdjustment) * burger.quantity;
                          });
                        });

                        return (
                          <div
                            key={c.id}
                            className="space-y-2 border-b pb-3 last:border-0"
                          >
                            <div className="flex justify-between font-medium">
                              <span>
                                {c.quantity}x {c.combo.name}
                              </span>
                              <span>
                                {formatCurrency(c.combo.price * c.quantity)}
                              </span>
                            </div>

                            {c.slots.map((slot) => (
                              <div key={slot.slotId} className="ml-4 space-y-1">
                                {slot.burgers.map((b, i) => {
                                  const meatDiff =
                                    b.meatCount -
                                    b.burger.default_meat_quantity;

                                  return (
                                    <div
                                      key={i}
                                      className="text-xs text-muted-foreground"
                                    >
                                      <div>
                                        • {b.quantity}x {b.burger.name} (
                                        {b.meatCount}{" "}
                                        {b.meatCount === 1 ? "carne" : "carnes"}
                                        )
                                      </div>

                                      {/* Ingredientes removidos */}
                                      {b.removedIngredients.length > 0 && (
                                        <div className="ml-4">
                                          Sin: {b.removedIngredients.join(", ")}
                                        </div>
                                      )}

                                      {/* Ajuste de carne */}
                                      {meatDiff !== 0 && meatExtra && (
                                        <div className="ml-4">
                                          {meatDiff > 0 ? "+" : ""} {meatDiff}x
                                          Medallón (
                                          {formatCurrency(
                                            meatDiff *
                                              meatExtra.price *
                                              b.quantity,
                                          )}
                                          )
                                        </div>
                                      )}

                                      {/* Extras */}
                                      {b.selectedExtras.map((ext) => (
                                        <div
                                          key={ext.extra.id}
                                          className="ml-4"
                                        >
                                          + {ext.quantity}x {ext.extra.name} (
                                          {formatCurrency(
                                            ext.extra.price * ext.quantity,
                                          )}
                                          )
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}

                            {/* Mostrar total de extras si hay */}
                            {comboExtrasTotal > 0 && (
                              <div className="ml-4 text-xs font-medium text-primary">
                                Extras: +{formatCurrency(comboExtrasTotal)}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div className="space-y-1 text-sm">
                        {extrasTotal > 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Extras</span>
                            <span>{formatCurrency(extrasTotal)}</span>
                          </div>
                        )}

                        {deliveryType === "delivery" && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Envío</span>
                            <span>{formatCurrency(deliveryFee)}</span>
                          </div>
                        )}

                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Método de pago</span>
                          <span>
                            {paymentMethod === "cash"
                              ? "Efectivo"
                              : "Transferencia"}
                          </span>
                        </div>
                      </div>

                      <Separator className="my-2" />

                      <div className="flex justify-between text-lg font-bold">
                        <span>Total</span>
                        <span>{formatCurrency(orderTotal)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* ================= NOTAS ================= */}
                  <div className="space-y-3">
                    <Label htmlFor="notes">Notas del pedido</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Instrucciones especiales..."
                      rows={3}
                      className="bg-white"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-between border-t px-6 py-4 z-10 bg-background">
            {step !== "customer" && (
              <Button
                variant="outline"
                onClick={() => {
                  if (step === "combos") setStep("customer");
                  else if (step === "burgers") setStep("combos");
                  else if (step === "summary") setStep("burgers");
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Atrás
              </Button>
            )}
            {step === "customer" && <div />}

            {step === "customer" && (
              <Button
                onClick={() => setStep("combos")}
                disabled={!canProceedFromCustomer}
              >
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {step === "combos" && (
              <Button onClick={() => setStep("burgers")}>
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {step === "burgers" && (
              <Button
                onClick={() => setStep("summary")}
                disabled={!canProceedFromBurgers}
              >
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {step === "summary" && (
              <Button
                onClick={handleSubmit}
                disabled={!deliveryType || createOrder.isPending}
              >
                {createOrder.isPending ? "Creando..." : "Crear pedido"}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {selectedCustomer && (
        <EditCustomerModal
          open={isEditingCustomer}
          onOpenChange={setIsEditingCustomer}
          customer={selectedCustomer}
        />
      )}
    </>
  );
}
