import { useCallback } from "react";
import type React from "react";
import { nextTabIndex, type TabListOrientation } from "@/lib/tabListKeyboard";

interface Options<T extends string> {
  ids: readonly T[];
  current: T;
  orientation: TabListOrientation;
  onSelect: (id: T) => void;
  elementId: (id: T) => string;
}

export function useTabListKeyboard<T extends string>({
  ids,
  current,
  orientation,
  onSelect,
  elementId,
}: Options<T>) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      const idx = nextTabIndex(
        ids.length,
        ids.indexOf(current),
        e.key,
        orientation,
      );
      if (idx === null) return;
      e.preventDefault();
      const target = ids[idx];
      onSelect(target);
      document.getElementById(elementId(target))?.focus();
    },
    [ids, current, orientation, onSelect, elementId],
  );
}
