import { Cancel01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ActionBar,
  ActionBarClose,
  ActionBarGroup,
  ActionBarItem,
  ActionBarSelection,
  ActionBarSeparator,
} from "@/components/ui/action-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function ListMembersActionBar({
  selectedMemberIds,
  isRemoving,
  onClearSelection,
  onRemoveMembers,
}: {
  readonly selectedMemberIds: readonly string[];
  readonly isRemoving: boolean;
  readonly onClearSelection: () => void;
  readonly onRemoveMembers: (memberIds: readonly string[]) => Promise<void>;
}): React.JSX.Element {
  const selectedCount = selectedMemberIds.length;

  return (
    <ActionBar
      open={selectedCount > 0}
      onOpenChange={(open) => {
        if (!open) onClearSelection();
      }}
    >
      <ActionBarSelection className="border-none">{selectedCount} selected</ActionBarSelection>
      <ActionBarSeparator />
      <ActionBarGroup>
        <ConfirmDialog
          renderTrigger={
            <ActionBarItem
              disabled={selectedCount === 0 || isRemoving}
              onSelect={(event) => event.preventDefault()}
              variant="destructive"
            >
              <HugeiconsIcon icon={Delete02Icon} />
              <span>{isRemoving ? "Removing..." : "Remove from List"}</span>
            </ActionBarItem>
          }
          title={`Remove ${selectedCount} from List?`}
          description="This removes the selection from this List. The Items, Collection Items, and Orders will not be deleted."
          confirmLabel="Remove"
          loadingLabel="Removing..."
          onConfirm={async () => {
            await onRemoveMembers(selectedMemberIds);
            onClearSelection();
          }}
        />
      </ActionBarGroup>
      <ActionBarSeparator />
      <ActionBarClose aria-label="Clear selection">
        <HugeiconsIcon icon={Cancel01Icon} />
      </ActionBarClose>
    </ActionBar>
  );
}
