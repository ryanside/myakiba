import { expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useSelection } from "./use-selection";

test("a selected member the List no longer has drops out of the selection", () => {
  const { result, rerender } = renderHook(({ loaded }) => useSelection(loaded), {
    initialProps: { loaded: new Set(["m1", "m2"]) as ReadonlySet<string> },
  });
  act(() => result.current.setSelection({ m1: true, m2: true }));

  rerender({ loaded: new Set(["m1"]) });

  expect([...result.current.selectedIds]).toEqual(["m1"]);
});
