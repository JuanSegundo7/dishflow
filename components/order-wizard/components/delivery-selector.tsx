"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrderWizardContext } from "../order-wizard-context";

export function DeliverySelector() {
  const { deliveryType, setDeliveryType, deliveryFee, setDeliveryFee } =
    useOrderWizardContext();

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          variant={deliveryType === "pickup" ? "default" : "outline"}
          className="flex-1"
          onClick={() => setDeliveryType("pickup")}
        >
          🏃 Retiro
        </Button>

        <Button
          variant={deliveryType === "delivery" ? "default" : "outline"}
          className="flex-1"
          onClick={() => setDeliveryType("delivery")}
        >
          🛵 Envío
        </Button>
      </div>

      {deliveryType === "delivery" && (
        <Input
          type="number"
          value={deliveryFee}
          onChange={(e) => setDeliveryFee(Number(e.target.value))}
        />
      )}
    </div>
  );
}
