import { afterEach, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { removeLocalStorage, useHasLocalStorage, useLocalStorage } from "./use-local-storage";

const KEYS = ["table:order", "table:sizing"] as const;

afterEach(() => localStorage.clear());

test("removing stored values sends their readers back to defaults, and the restore puts them back", () => {
  const { result } = renderHook(() => ({
    order: useLocalStorage<string[]>("table:order", ["name", "price"]),
    customized: useHasLocalStorage(KEYS),
  }));
  expect(result.current.customized).toBe(false);

  act(() => result.current.order[1](["price", "name"]));
  expect(result.current.customized).toBe(true);

  let restore = () => {};
  act(() => {
    restore = removeLocalStorage(KEYS);
  });
  expect(result.current.order[0]).toEqual(["name", "price"]);
  expect(result.current.customized).toBe(false);

  act(() => restore());
  expect(result.current.order[0]).toEqual(["price", "name"]);
  expect(result.current.customized).toBe(true);
});
