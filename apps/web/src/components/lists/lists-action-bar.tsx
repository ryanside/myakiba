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
import { WriteConfirmDialog } from "@/components/write-confirm-dialog";
import type { Saving } from "@/data/client";

export function ListsActionBar({
  selectedListIds,
  isDeleting,
  onClearSelection,
  onDeleteLists,
}: {
  readonly selectedListIds: ReadonlySet<string>;
  readonly isDeleting: boolean;
  readonly onClearSelection: () => void;
  readonly onDeleteLists: (listIds: ReadonlySet<string>) => Saving;
}): React.JSX.Element {
  const selectedCount = selectedListIds.size;

  return (
    <ActionBar
      open={selectedCount > 0}
      onOpenChange={(open) => {
        if (!open) onClearSelection();
      }}
    >
      <ActionBarSelection className="border-none">
        {selectedCount} {selectedCount === 1 ? "List" : "Lists"} selected
      </ActionBarSelection>
      <ActionBarSeparator />
      <ActionBarGroup>
        <WriteConfirmDialog
          renderTrigger={
            <ActionBarItem
              disabled={selectedCount === 0 || isDeleting}
              onSelect={(event) => event.preventDefault()}
              variant="destructive"
            >
              <HugeiconsIcon icon={Delete02Icon} />
              <span>{isDeleting ? "Deleting..." : "Delete"}</span>
            </ActionBarItem>
          }
          title={`Delete ${selectedCount} ${selectedCount === 1 ? "List" : "Lists"}?`}
          description="This removes the selected Lists. Their Items, Collection Items, and Orders will not be deleted."
          onConfirm={async () => {
            const saved = await onDeleteLists(selectedListIds);
            if (saved.isOk()) onClearSelection();
            return saved;
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
