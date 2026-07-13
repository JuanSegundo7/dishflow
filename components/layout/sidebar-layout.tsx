"use client";

import type React from "react";
import { SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import { useRef } from "react";
import { AppSidebar } from "./sidebar";

export function SidebarLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { setOpen, isMobile } = useSidebar();
  const timeoutRef = useRef<NodeJS.Timeout>();

  const handleHoverStart = () => {
    if (!isMobile && window.matchMedia("(hover: hover)").matches) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setOpen(true);
    }
  };

  const handleHoverEnd = () => {
    if (!isMobile && window.matchMedia("(hover: hover)").matches) {
      timeoutRef.current = setTimeout(() => {
        setOpen(false);
      }, 250);
    }
  };

  return (
    <>
      <motion.div
        onHoverStart={handleHoverStart}
        onHoverEnd={handleHoverEnd}
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1, ease: "easeInOut" }}
      >
        <AppSidebar />
      </motion.div>
      <SidebarInset>
        <main className="flex flex-1 flex-col overflow-y-auto p-4 md:p-2 container mx-auto">
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
