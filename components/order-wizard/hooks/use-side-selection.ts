import { useState } from "react";
import { nanoid } from "nanoid";
import type { Extra } from "@/lib/types";

export interface SelectedSide {
  id: string;
  extra: Extra;
  quantity: number;
  selectedExtras: { extra: Extra; quantity: number }[]; // 🆕
  expanded: boolean; // 🆕
}

export function useSidesSelection() {
  const [selectedSides, setSelectedSides] = useState<SelectedSide[]>([]);

  const addSide = (extra: Extra) => {
    setSelectedSides((prev) => {
      const existing = prev.find((s) => s.extra.id === extra.id);
      if (existing) {
        return prev.map((s) =>
          s.extra.id === extra.id ? { ...s, quantity: s.quantity + 1 } : s,
        );
      }
      return [
        ...prev,
        { id: nanoid(), extra, quantity: 1, selectedExtras: [], expanded: false },
      ];
    });
  };

  const removeSide = (id: string) => {
    setSelectedSides((prev) => prev.filter((s) => s.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setSelectedSides((prev) =>
      prev
        .map((s) => (s.id === id ? { ...s, quantity: s.quantity + delta } : s))
        .filter((s) => s.quantity > 0),
    );
  };

  const toggleExpanded = (id: string) => {
    setSelectedSides((prev) =>
      prev.map((s) => (s.id === id ? { ...s, expanded: !s.expanded } : s)),
    );
  };

  const toggleExtra = (id: string, extra: Extra) => {
    setSelectedSides((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const exists = s.selectedExtras.find((e) => e.extra.id === extra.id);
        if (exists) {
          return {
            ...s,
            selectedExtras: s.selectedExtras.filter(
              (e) => e.extra.id !== extra.id,
            ),
          };
        }
        return {
          ...s,
          selectedExtras: [...s.selectedExtras, { extra, quantity: 1 }],
        };
      }),
    );
  };

  const updateExtraQuantity = (id: string, extraId: string, delta: number) => {
    setSelectedSides((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        return {
          ...s,
          selectedExtras: s.selectedExtras
            .map((e) =>
              e.extra.id === extraId
                ? { ...e, quantity: e.quantity + delta }
                : e,
            )
            .filter((e) => e.quantity > 0),
        };
      }),
    );
  };

  const reset = () => {
    setSelectedSides([]);
  };

  const loadSides = (sides: SelectedSide[]) => {
    setSelectedSides(sides);
  };

  return {
    selectedSides,
    addSide,
    removeSide,
    updateQuantity,
    toggleExpanded,
    toggleExtra,
    updateExtraQuantity,
    reset,
    loadSides,
  };
}