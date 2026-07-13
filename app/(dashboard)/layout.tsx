import type React from "react";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

import { Analytics } from "@vercel/analytics/next";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "sonner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <SidebarProvider defaultOpen={false}>
          <SidebarLayout>{children}</SidebarLayout>
          <Toaster richColors position="top-right" />
        </SidebarProvider>
        <Analytics />
      </QueryProvider>
    </ThemeProvider>
  );
}
