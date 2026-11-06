import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "@/components/ui/toast";
import { useToolbarSearch } from "./use-toolbar-search";

afterEach(() => {
  cleanup();
  mock.restore();
});

test("a rejected Reset navigation reports an error without leaking its rejection", async () => {
  const added = spyOn(toast, "add").mockReturnValue("reset-error");
  const navigate = mock(async () => {
    throw new Error("Navigation failed");
  });
  const { result } = renderHook(() => useToolbarSearch(navigate));
  let outcomes: PromiseSettledResult<void>[] = [];

  await act(async () => {
    outcomes = await Promise.allSettled([result.current.resetSearch()]);
  });

  expect(navigate).toHaveBeenCalledTimes(1);
  expect(added).toHaveBeenCalledTimes(1);
  expect(added).toHaveBeenCalledWith({
    type: "error",
    title: "Failed to reset filters. Please try again.",
  });
  expect(outcomes).toEqual([{ status: "fulfilled", value: undefined }]);
});

test("a rejected Reset navigation restores focus to the remounted search field", async () => {
  spyOn(toast, "add").mockReturnValue("reset-error");
  const resetFilters = async () => {
    throw new Error("Navigation failed");
  };
  function Toolbar() {
    const { inputRef, searchResetKey, hasSearchDraft, onSearchTextChange, resetSearch } =
      useToolbarSearch(resetFilters);
    return (
      <>
        <input
          aria-label="Search"
          key={searchResetKey}
          onChange={(event) => onSearchTextChange(event.target.value)}
          ref={inputRef}
        />
        {hasSearchDraft && (
          <button onClick={resetSearch} type="button">
            Reset Filters
          </button>
        )}
      </>
    );
  }
  const user = userEvent.setup({ delay: null });
  render(<Toolbar />);
  const originalInput = screen.getByRole("textbox", { name: "Search" });
  await user.type(originalInput, "mi");
  await user.tab();
  expect(document.activeElement === screen.getByRole("button", { name: "Reset Filters" })).toBe(
    true,
  );

  await user.keyboard("{Enter}");

  expect(originalInput.isConnected).toBe(false);
  await waitFor(() => {
    expect(document.activeElement === screen.getByRole("textbox", { name: "Search" })).toBe(true);
  });
});
