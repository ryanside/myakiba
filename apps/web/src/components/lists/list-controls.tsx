import { Delete02Icon, Edit03Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ListInput } from "@myakiba/contracts/lists/schema";
import { useState } from "react";
import type { ReactNode } from "react";
import type { getLists } from "@/queries/lists";
import { ListFormDialog } from "@/components/lists/list-form-dialog";
import type { ListViewMode } from "@/components/lists/list-view-toggle";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ItemControl, ItemControls, ItemControlsSelection } from "@/components/ui/item-controls";
import { cn } from "@/lib/utils";

type ListsPage = NonNullable<Awaited<ReturnType<typeof getLists>>>;
type ListRecord = ListsPage["items"][number];

export function ListControls({
  list,
  viewMode,
  selected,
  active,
  onToggleSelection,
  onUpdate,
  onDelete,
  children,
}: {
  readonly list: ListRecord;
  readonly viewMode: ListViewMode;
  readonly selected: boolean;
  readonly active: boolean;
  readonly onToggleSelection: () => void;
  readonly onUpdate: (listId: string, input: ListInput) => Promise<unknown>;
  readonly onDelete: (listId: string) => Promise<void>;
  readonly children: ReactNode;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <ItemControls
      key={viewMode}
      active={viewMode === "list" || selected || active || menuOpen}
      className={cn(
        viewMode === "grid"
          ? "absolute top-2 right-2 bg-background/90 shadow-[0_0_0_1px_oklch(0_0_0/0.08),0_2px_8px_oklch(0_0_0/0.12)] backdrop-blur-md dark:shadow-[0_0_0_1px_oklch(1_0_0/0.12),0_2px_8px_oklch(0_0_0/0.24)]"
          : "mr-1",
      )}
    >
      <ItemControlsSelection
        checked={selected}
        onCheckedChange={onToggleSelection}
        label={`${selected ? "Deselect" : "Select"} ${list.title}`}
      />
      {children}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <ItemControl aria-label={`Actions for ${list.title}`} title="More actions">
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </ItemControl>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <ListFormDialog
              triggerNativeButton={false}
              triggerRole="menuitem"
              renderTrigger={
                <DropdownMenuItem closeOnClick={false}>
                  <HugeiconsIcon icon={Edit03Icon} />
                  Edit
                </DropdownMenuItem>
              }
              title="Edit List"
              description="Change this List's title or description."
              initialTitle={list.title}
              initialDescription={list.description}
              submitLabel="Save"
              pendingLabel="Saving..."
              onSubmit={(input) => onUpdate(list.id, input)}
            />
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <ConfirmDialog
              triggerNativeButton={false}
              triggerRole="menuitem"
              renderTrigger={
                <DropdownMenuItem closeOnClick={false} variant="destructive">
                  <HugeiconsIcon icon={Delete02Icon} />
                  Delete
                </DropdownMenuItem>
              }
              title="Delete List?"
              description="This removes the List. Its Items, Collection Items, and Orders will not be deleted."
              onConfirm={() => onDelete(list.id)}
            />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ItemControls>
  );
}
