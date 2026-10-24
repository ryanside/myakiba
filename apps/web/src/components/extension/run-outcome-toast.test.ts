import { afterEach, expect, spyOn, test } from "bun:test";
import { Panic } from "better-result";
import { toast } from "@/components/ui/toast";
import { toastRunOutcome } from "./run-outcome-toast";

const toastAdd = spyOn(toast, "add");
const consoleError = spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  toastAdd.mockClear();
  consoleError.mockClear();
});

const STOPPED = {
  type: "error",
  title: "The import stopped unexpectedly",
  description: "Reload the page to see which items were imported.",
};

async function settled() {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

test("a run that ends says nothing", async () => {
  toastRunOutcome(Promise.resolve({ kind: "ended" }));
  await settled();

  expect(toastAdd).not.toHaveBeenCalled();
  expect(consoleError).not.toHaveBeenCalled();
});

test("a run stopped at the hourly limit says how many items were not imported", async () => {
  toastRunOutcome(Promise.resolve({ kind: "busy", notImported: 3, retryAfterMs: 90_000 }));
  await settled();

  expect(toastAdd.mock.calls).toEqual([
    [
      {
        type: "error",
        title: "You've reached the hourly import limit",
        description: "3 items were not imported. Try again in 2 min.",
      },
    ],
  ]);
});

test("a run that crashes shows the generic toast and reports the crash as a Panic", async () => {
  const crash = new TypeError("run is not iterable");
  toastRunOutcome(Promise.reject(crash));
  await settled();

  expect(toastAdd.mock.calls).toEqual([[STOPPED]]);
  expect(consoleError).toHaveBeenCalledTimes(1);
  const [reported] = consoleError.mock.calls[0] ?? [];
  expect(Panic.is(reported) && reported.cause).toBe(crash);
});
