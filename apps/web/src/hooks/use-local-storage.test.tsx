import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import * as z from "zod";
import { useLocalStorage } from "./use-local-storage";

const KEY = "use-local-storage-test";
const schema = z.object({ step: z.number() });
const INITIAL = { step: 0 };

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** Runs `check` while the page's storage is `storage`. happy-dom's own storage ignores spies. */
function withStorage(storage: Pick<Storage, "getItem" | "setItem">, check: () => void) {
  const pageStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    check();
  } finally {
    if (pageStorage) Object.defineProperty(globalThis, "localStorage", pageStorage);
  }
}

function renderStored(key = KEY) {
  return renderHook(() => useLocalStorage(key, INITIAL, schema)).result;
}

test("reads a stored value that matches the schema", () => {
  localStorage.setItem(KEY, JSON.stringify({ step: 2 }));

  expect(renderStored().current[0]).toEqual({ step: 2 });
});

test("reads any stored JSON when the caller has no schema", () => {
  localStorage.setItem(KEY, JSON.stringify(["name", "price"]));

  const { result } = renderHook(() => useLocalStorage<readonly string[]>(KEY, []));

  expect(result.current[0]).toEqual(["name", "price"]);
});

test("falls back to the initial value without a schema when the stored text is not JSON", () => {
  localStorage.setItem(KEY, "[name");
  const initial: readonly string[] = [];

  const { result } = renderHook(() => useLocalStorage(KEY, initial));

  expect(result.current[0]).toBe(initial);
});

test.each([
  ["nothing is stored", null],
  ["the stored text is not JSON", "{step:"],
  ["the stored value does not match the schema", JSON.stringify({ step: "two" })],
])("falls back to the initial value when %s", (_case, stored) => {
  if (stored !== null) localStorage.setItem(KEY, stored);

  expect(renderStored().current[0]).toBe(INITIAL);
});

test("falls back to the initial value when storage cannot be read", () => {
  const insecure = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };

  withStorage({ getItem: insecure, setItem: insecure }, () => {
    expect(renderStored().current[0]).toBe(INITIAL);
  });
});

test("writes the value to storage", () => {
  const stored = renderStored();

  act(() => stored.current[1]((previous) => ({ step: previous.step + 1 })));

  expect(stored.current[0]).toEqual({ step: 1 });
  expect(localStorage.getItem(KEY)).toBe(JSON.stringify({ step: 1 }));
});

test("keeps a value storage refuses for the rest of the session", () => {
  const full = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    },
  };

  withStorage(full, () => {
    // The refused value outlives this test in the module, so it gets a key of its own.
    const stored = renderStored("refused-key");
    act(() => stored.current[1]({ step: 3 }));

    expect(stored.current[0]).toEqual({ step: 3 });
    expect(renderStored("refused-key").current[0]).toEqual({ step: 3 });
  });
});
