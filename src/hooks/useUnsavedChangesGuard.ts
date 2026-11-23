import { useCallback, useState } from "react";

export function useUnsavedChangesGuard(
  hasUnsavedChanges: boolean,
  onClose: () => void,
) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const requestClose = useCallback(() => {
    if (hasUnsavedChanges) setConfirmOpen(true);
    else onClose();
  }, [hasUnsavedChanges, onClose]);
  const confirmDiscard = useCallback(() => {
    setConfirmOpen(false);
    onClose();
  }, [onClose]);
  const cancelConfirm = useCallback(() => setConfirmOpen(false), []);
  return { confirmOpen, requestClose, confirmDiscard, cancelConfirm };
}
