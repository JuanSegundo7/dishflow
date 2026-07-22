import { AlertTriangle, Ban, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/format";
import type { EntitlementsResponse } from "@/lib/entitlements";
import { SignOutButton } from "@/components/billing/sign-out-button";

interface BillingBlockProps {
  reason: "past_due" | "suspended" | "no_subscription";
  billing?: EntitlementsResponse["billing"];
}

const REASON_CONTENT: Record<
  BillingBlockProps["reason"],
  { icon: typeof CreditCard; title: string; description: string }
> = {
  past_due: {
    icon: CreditCard,
    title: "Pago pendiente",
    description:
      "Hay un pago pendiente en la suscripción de esta cuenta. Regularizá el pago para volver a acceder a las funciones del panel.",
  },
  suspended: {
    icon: Ban,
    title: "Cuenta suspendida",
    description:
      "Esta cuenta se encuentra suspendida. Contactá al administrador de tu suscripción para reactivarla.",
  },
  no_subscription: {
    icon: AlertTriangle,
    title: "Sin suscripción activa",
    description:
      "Esta cuenta todavía no tiene una suscripción activa asociada. Contactá al administrador para activar un plan.",
  },
};

export function BillingBlock({ reason, billing }: BillingBlockProps) {
  const { icon: Icon, title, description } = REASON_CONTENT[reason];

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Icon className="size-6" />
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">{description}</p>
          {billing?.current_period_end && (
            <p className="mt-4 text-xs text-muted-foreground">
              Último período vigente hasta {formatDate(billing.current_period_end)}
            </p>
          )}
          <div className="mt-6 flex justify-center">
            <SignOutButton />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
