"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus } from "lucide-react";
import { useAllSupplies } from "@/lib/hooks/supplies/use-supplies";
import { useDeleteSupply, useToggleSupplyActive } from "@/lib/hooks/supplies/use-supplies-crud";
import { SupplyList } from "@/components/supplies/supply-list";
import { SupplyFormDialog } from "@/components/supplies/supply-form-dialog";
import { LowStockBanner } from "@/components/supplies/low-stock-banner";
import type { Supply } from "@/lib/types";

/**
 * /insumos — gated by the `stock_management` service key via
 * lib/service-nav-map.ts (SERVICE_NAV_HREFS). Gating is enforced by
 * middleware.ts (redirects to /plan when the service is inactive) and by
 * components/layout/sidebar.tsx (hides the nav link) — this page component
 * itself does not re-check access, matching every other service-gated page
 * in this repo (e.g. "/", "/historial"), none of which re-check client-side
 * either. Title/subtitle are hardcoded here (not pulled from
 * lib/verticals/*'s VerticalLabels) since stock management isn't
 * vertical-flavored copy — out of scope for this PR to add a new
 * PageCopy slot across every vertical definition for a single static title.
 */
export default function InsumosPage() {
  const { data: supplies, isLoading } = useAllSupplies();
  const deleteSupply = useDeleteSupply();
  const toggleActive = useToggleSupplyActive();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupply, setEditingSupply] = useState<Supply | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSupply, setDeletingSupply] = useState<Supply | null>(null);

  const openCreate = () => {
    setEditingSupply(null);
    setDialogOpen(true);
  };

  const openEdit = (supply: Supply) => {
    setEditingSupply(supply);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingSupply) return;
    try {
      await deleteSupply.mutateAsync(deletingSupply.id);
    } catch {
      /* alert already shown by the mutation's onError */
    }
    setDeleteDialogOpen(false);
    setDeletingSupply(null);
  };

  return (
    <div className="flex h-screen flex-col">
      <Header title="Insumos" subtitle="Gestioná el stock y costo de tus insumos" />

      <div className="p-4 flex justify-end bg-background">
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo insumo
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <LowStockBanner supplies={supplies ?? []} />

        <Card className="bg-card">
          <CardContent className="p-4">
            <SupplyList
              supplies={supplies ?? []}
              isLoading={isLoading}
              onEdit={openEdit}
              onDelete={(supply) => {
                setDeletingSupply(supply);
                setDeleteDialogOpen(true);
              }}
              onToggleActive={(supply) =>
                toggleActive.mutate({ id: supply.id, isActive: !supply.is_active })
              }
            />
          </CardContent>
        </Card>
      </div>

      <SupplyFormDialog open={dialogOpen} onOpenChange={setDialogOpen} supply={editingSupply} />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="ios-glass rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar insumo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar &quot;{deletingSupply?.name}&quot;? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onClick={handleDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
