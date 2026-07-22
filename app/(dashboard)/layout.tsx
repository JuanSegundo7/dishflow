import type React from "react";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

import { Analytics } from "@vercel/analytics/next";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "sonner";
import { BillingBlock } from "@/components/billing/billing-block";
import { getEntitlements } from "@/lib/entitlements";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Layer 0 billing gate: block business features when the account is known
  // to be past-due/suspended/without a subscription. This never touches
  // login/auth — app/login/page.tsx lives outside this layout, and the
  // "unknown" (unreachable/misconfigured control-panel) case fails open below
  // so an unrelated ops/network problem never locks out a paying customer.
  const entitlements = await getEntitlements();
  const isBlocked =
    entitlements.status === "known" && entitlements.data.access.allowed === false;

  // Active service keys drive sidebar gating (see lib/service-nav-map.ts).
  // `null` means "don't gate anything" — used for the "unknown" entitlements
  // state so a control-panel outage never hides nav items a user relies on.
  const activeServiceKeys =
    entitlements.status === "known"
      ? entitlements.data.services.filter((service) => service.active).map((service) => service.key)
      : null;

  return (
    <ThemeProvider>
      <QueryProvider>
        {isBlocked && entitlements.status === "known" ? (
          <BillingBlock
            reason={entitlements.data.access.reason as "past_due" | "suspended" | "no_subscription"}
            billing={entitlements.data.billing}
          />
        ) : (
          <SidebarProvider defaultOpen={false}>
            <SidebarLayout activeServiceKeys={activeServiceKeys}>{children}</SidebarLayout>
            <Toaster richColors position="top-right" />
          </SidebarProvider>
        )}
        <Analytics />
      </QueryProvider>
    </ThemeProvider>
  );
}
