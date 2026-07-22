import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingBlock } from "@/components/billing/billing-block";
import { getEntitlements } from "@/lib/entitlements";

// Standalone route outside the (dashboard) group so it renders without the
// sidebar shell — same pattern as app/login/page.tsx. Reached either via a
// direct link from the dashboard billing gate or via middleware.ts
// redirecting a blocked deep-link here.
export default async function SuspendedPage() {
  const entitlements = await getEntitlements();

  if (entitlements.status === "known" && entitlements.data.access.allowed === false) {
    return (
      <BillingBlock
        reason={entitlements.data.access.reason as "past_due" | "suspended" | "no_subscription"}
        billing={entitlements.data.billing}
      />
    );
  }

  // Fail-open / already-resolved state: the account isn't actually blocked
  // (control-panel was unreachable, or access was restored since the
  // redirect happened). Don't strand the user on this page.
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-xl">Todo en orden</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            No encontramos ningún bloqueo activo en esta cuenta.
          </p>
          <Link
            href="/"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Volver al inicio
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
