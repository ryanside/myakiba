import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import type { getListMembers } from "@/queries/lists";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ItemControl, ItemControlsSelection } from "@/components/ui/item-controls";
import { Spinner } from "@/components/ui/spinner";

type ListMembersPage = NonNullable<Awaited<ReturnType<typeof getListMembers>>>;
type ListMember = ListMembersPage["items"][number];

export function ListMemberControls({
  member,
  selected,
  removeDisabled,
  isRemoving,
  onToggleSelection,
  onRemove,
  children,
}: {
  readonly member: ListMember;
  readonly selected: boolean;
  readonly removeDisabled: boolean;
  readonly isRemoving: boolean;
  readonly onToggleSelection: () => void;
  readonly onRemove: (memberId: string) => Promise<void>;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <>
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
        onConfirm={() => onRemove(member.id)}
      />
    </>
  );
}
