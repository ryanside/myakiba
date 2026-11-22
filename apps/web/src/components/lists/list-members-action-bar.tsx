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
import type { Saving } from "@/data/client";

export function ListMembersActionBar({
  selectedMemberIds,
  isRemoving,
  onClearSelection,
  onDeselect,
  onRemoveMembers,
}: {
  readonly selectedMemberIds: readonly string[];
  readonly isRemoving: boolean;
  readonly onClearSelection: () => void;
  readonly onDeselect: (memberIds: readonly string[]) => void;
  readonly onRemoveMembers: (memberIds: readonly string[]) => Saving;
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
        <ActionBarItem
          disabled={selectedCount === 0 || isRemoving}
          onSelect={async (event) => {
            event.preventDefault();
            const removing = selectedMemberIds;
            const saved = await onRemoveMembers(removing);
            if (saved.isOk()) onDeselect(removing);
          }}
          variant="destructive"
        >
          <HugeiconsIcon icon={Delete02Icon} />
          <span>{isRemoving ? "Removing..." : "Remove from List"}</span>
        </ActionBarItem>
      </ActionBarGroup>
      <ActionBarSeparator />
      <ActionBarClose aria-label="Clear selection">
        <HugeiconsIcon icon={Cancel01Icon} />
      </ActionBarClose>
    </ActionBar>
  );
}
