import type { ComponentProps, ReactElement } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Saving } from "@/data/client";

type WriteConfirmDialogProps = Omit<ComponentProps<typeof ConfirmDialog>, "onConfirm"> & {
  readonly onConfirm: () => Saving;
};

/** A ConfirmDialog for a write: it closes when the write saves and stays open when it fails. */
export function WriteConfirmDialog({ onConfirm, ...props }: WriteConfirmDialogProps): ReactElement {
  return <ConfirmDialog {...props} onConfirm={onConfirm} />;
}
