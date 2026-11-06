import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
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
