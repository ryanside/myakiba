import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "motion/react";
import { useState } from "react";
import { StatusButton, useButtonStatus } from "./status-button";

const SUCCESS_DURATION = 200;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(cleanup);

function SaveButton<T>({
  work,
  succeeded,
  onSettled,
  disabled,
}: {
  work: () => Promise<T>;
  succeeded?: (value: T) => boolean;
  onSettled: (outcome: { value: T } | { error: unknown }) => void;
  disabled?: boolean;
}) {
  const { status, run } = useButtonStatus({ successDuration: SUCCESS_DURATION });
  return (
    <StatusButton
      status={status}
      successLabel="Saved"
      disabled={disabled}
      onClick={async () => {
        try {
          onSettled({ value: await run(work, succeeded) });
        } catch (error) {
          onSettled({ error });
        }
      }}
    >
      Save
    </StatusButton>
  );
}

function button() {
  return screen.getByRole("button");
}

test("shows loading while the work is pending, then success, then idle after the duration", async () => {
  const work = Promise.withResolvers<string>();
  const outcomes: unknown[] = [];
  render(<SaveButton work={() => work.promise} onSettled={(outcome) => outcomes.push(outcome)} />);
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(button().getAttribute("aria-busy")).toBe("true");
  expect(button().dataset.status).toBe("loading");
  expect(screen.getByRole("status", { name: "Loading" })).toBeDefined();

  await act(async () => work.resolve("row"));
  expect(outcomes).toEqual([{ value: "row" }]);
  expect(button().dataset.status).toBe("success");
  expect(button().getAttribute("aria-busy")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Saved");

  await waitFor(() => expect(button().dataset.status).toBe("idle"), {
    timeout: SUCCESS_DURATION * 5,
  });
  expect(button().getAttribute("aria-disabled")).toBeNull();
});

test("a rejected work returns to idle and the rejection reaches the caller", async () => {
  const work = Promise.withResolvers<null>();
  const outcomes: unknown[] = [];
  render(<SaveButton work={() => work.promise} onSettled={(outcome) => outcomes.push(outcome)} />);
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Save" }));
  const error = new Error("offline");
  await act(async () => work.reject(error));

  expect(outcomes).toEqual([{ error }]);
  expect(button().dataset.status).toBe("idle");
  expect(button().getAttribute("aria-busy")).toBeNull();
});

test("a value that did not succeed returns to idle without showing success", async () => {
  const outcomes: unknown[] = [];
  render(
    <SaveButton
      work={async () => false}
      succeeded={(ok) => ok}
      onSettled={(outcome) => outcomes.push(outcome)}
    />,
  );
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(outcomes).toEqual([{ value: false }]));
  expect(button().dataset.status).toBe("idle");
  expect(screen.queryByText("Saved", { selector: "[role=status]" })).toBeNull();
});

test("clicks while loading are ignored and cancelled", async () => {
  const work = Promise.withResolvers<null>();
  let runs = 0;
  render(
    <SaveButton
      work={() => {
        runs += 1;
        return work.promise;
      }}
      onSettled={() => {}}
    />,
  );
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Save" }));
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  act(() => {
    button().dispatchEvent(click);
  });
  expect(click.defaultPrevented).toBe(true);
  expect(button().getAttribute("aria-disabled")).toBe("true");
  expect(runs).toBe(1);
});

test("a click during success starts another run", async () => {
  const works: PromiseWithResolvers<null>[] = [];
  render(
    <SaveButton
      work={() => {
        const work = Promise.withResolvers<null>();
        works.push(work);
        return work.promise;
      }}
      onSettled={() => {}}
    />,
  );
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Save" }));
  await act(async () => works[0]?.resolve(null));
  expect(button().dataset.status).toBe("success");
  expect(button().getAttribute("aria-disabled")).toBeNull();

  await user.click(button());
  expect(works).toHaveLength(2);
  expect(button().dataset.status).toBe("loading");
});

test("during success, the caller's disabled cancels clicks without fading the button, and applies once idle", async () => {
  let runs = 0;
  function SaveOnce() {
    const { status, run } = useButtonStatus({ successDuration: SUCCESS_DURATION });
    const [saved, setSaved] = useState(false);
    return (
      <StatusButton
        status={status}
        successLabel="Saved"
        disabled={saved}
        onClick={() => {
          runs += 1;
          run(async () => setSaved(true)).catch(() => {});
        }}
      >
        Save
      </StatusButton>
    );
  }
  render(<SaveOnce />);
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(button().dataset.status).toBe("success"));
  expect(button().hasAttribute("disabled")).toBe(false);
  expect(button().getAttribute("aria-disabled")).toBe("true");
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  act(() => {
    button().dispatchEvent(click);
  });
  expect(click.defaultPrevented).toBe(true);
  expect(runs).toBe(1);

  await waitFor(() => expect(button().dataset.status).toBe("idle"), {
    timeout: SUCCESS_DURATION * 5,
  });
  expect(button().hasAttribute("disabled")).toBe(true);
});
