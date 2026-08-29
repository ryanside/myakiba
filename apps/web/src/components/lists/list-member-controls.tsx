import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import type { getListMembers } from "@/queries/lists";
import type { GridListViewMode } from "@/components/ui/view-toggle";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ItemControl, ItemControls, ItemControlsSelection } from "@/components/ui/item-controls";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type ListMembersPage = NonNullable<Awaited<ReturnType<typeof getListMembers>>>;
type ListMember = ListMembersPage["items"][number];

export function ListMemberControls({
  member,
  viewMode,
  selected,
  active,
  removeDisabled,
  isRemoving,
  onToggleSelection,
  onRemove,
  children,
}: {
  readonly member: ListMember;
  readonly viewMode: GridListViewMode;
  readonly selected: boolean;
  readonly active: boolean;
  readonly removeDisabled: boolean;
  readonly isRemoving: boolean;
  readonly onToggleSelection: () => void;
  readonly onRemove: (memberId: string) => Promise<void>;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <ItemControls
      key={viewMode}
      active={viewMode === "list" || selected || active || isRemoving}
      className={cn(
        viewMode === "grid"
          ? "absolute top-2 right-2 bg-background/90 shadow-[0_0_0_1px_oklch(0_0_0/0.08),0_2px_8px_oklch(0_0_0/0.12)] backdrop-blur-md dark:shadow-[0_0_0_1px_oklch(1_0_0/0.12),0_2px_8px_oklch(0_0_0/0.24)]"
          : "mr-1",
      )}
    >
      <ItemControlsSelection
        checked={selected}
        onCheckedChange={onToggleSelection}
        label={`${selected ? "Deselect" : "Select"} ${member.title}`}
      />
      {children}
      <ConfirmDialog
        renderTrigger={
          <ItemControl
            className="hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
            aria-label={`Remove ${member.title} from List`}
            title="Remove from List"
            disabled={removeDisabled}
          >
            {isRemoving ? <Spinner /> : <HugeiconsIcon icon={Delete02Icon} aria-hidden="true" />}
          </ItemControl>
        }
        title="Remove from List?"
        description={`This will remove ${member.title} from this List.`}
        confirmLabel="Remove"
        loadingLabel="Removing..."
        onConfirm={() => onRemove(member.id)}
      />
    </ItemControls>
  );
}
