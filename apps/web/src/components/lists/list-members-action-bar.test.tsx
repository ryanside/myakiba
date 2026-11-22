import { afterEach, expect, test } from "bun:test";
import { Result } from "better-result";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Saving } from "@/data/client";
import { ListMembersActionBar } from "./list-members-action-bar";

afterEach(cleanup);

test("a remove deselects what it removed and keeps a member ticked while it was saving", async () => {
  const saving = Promise.withResolvers<Awaited<Saving>>();
  const cleared: string[] = [];
  const deselected: string[][] = [];
  const bar = (selectedMemberIds: readonly string[]) => (
    <ListMembersActionBar
      selectedMemberIds={selectedMemberIds}
      isRemoving={false}
      onClearSelection={() => cleared.push("all")}
      onDeselect={(memberIds) => deselected.push([...memberIds])}
      onRemoveMembers={() => saving.promise}
    />
  );
  const view = render(bar(["m1"]));
  const user = userEvent.setup({ delay: null });

  await user.click(screen.getByRole("button", { name: "Remove from List" }));
  view.rerender(bar(["m1", "m2"]));
  await act(async () => saving.resolve(Result.ok({ removedCount: 1, removed: [] })));

  expect({ cleared, deselected }).toEqual({ cleared: [], deselected: [["m1"]] });
});
