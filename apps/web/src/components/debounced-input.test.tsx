import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { DebouncedInput } from "./debounced-input";

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

const DEBOUNCE_MS = 50;
const waitForDebounce = () =>
  act(() => {
    jest.advanceTimersByTime(DEBOUNCE_MS);
  });

function renderOwnedInput(initialValue: string, { echoChanges = true } = {}) {
  const emitted: (string | number)[] = [];
  let setOwnerValue: (value: string) => void = () => {};
  let ownerValue = initialValue;

  function Owner() {
    const [value, setValue] = useState(initialValue);
    useEffect(() => {
      setOwnerValue = setValue;
    }, []);
    useEffect(() => {
      ownerValue = value;
    }, [value]);
    return (
      <DebouncedInput
        aria-label="Search"
        value={value}
        debounce={DEBOUNCE_MS}
        onChange={(next) => {
          emitted.push(next);
          if (echoChanges) setValue(String(next));
        }}
      />
    );
  }

  render(<Owner />);
  return {
    user: userEvent.setup({ advanceTimers: jest.advanceTimersByTime }),
    input: screen.getByRole("textbox", { name: "Search" }) as HTMLInputElement,
    emitted,
    ownerValue: () => ownerValue,
    setOwnerValue: (value: string) => act(() => setOwnerValue(value)),
  };
}

describe("DebouncedInput", () => {
  test("mounting does not report a change", async () => {
    const { input, emitted } = renderOwnedInput("figma");
    await waitForDebounce();

    expect(input.value).toBe("figma");
    expect(emitted).toEqual([]);
  });

  test("typing reports the final text once after the debounce", async () => {
    const { user, input, emitted } = renderOwnedInput("");
    await user.type(input, "miku");
    await waitForDebounce();

    expect(input.value).toBe("miku");
    expect(emitted).toEqual(["miku"]);
  });

  test("the debounced text goes to the onChange from the latest render", async () => {
    const first: (string | number)[] = [];
    const latest: (string | number)[] = [];
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { rerender } = render(
      <DebouncedInput
        aria-label="Search"
        value=""
        debounce={DEBOUNCE_MS}
        onChange={(next) => first.push(next)}
      />,
    );
    await user.type(screen.getByRole("textbox", { name: "Search" }), "miku");
    rerender(
      <DebouncedInput
        aria-label="Search"
        value=""
        debounce={DEBOUNCE_MS}
        onChange={(next) => latest.push(next)}
      />,
    );
    await waitForDebounce();

    expect({ first, latest }).toEqual({ first: [], latest: ["miku"] });
  });

  test("a late echo of earlier text does not replace what the user is typing", async () => {
    const { user, input, emitted, setOwnerValue } = renderOwnedInput("", { echoChanges: false });
    await user.type(input, "mi");
    await waitForDebounce();
    await user.type(input, "ku");
    await setOwnerValue(String(emitted[0]));

    expect({ emitted, shown: input.value }).toEqual({ emitted: ["mi"], shown: "miku" });
    await user.tab();
    expect(input.value).toBe("miku");
  });

  test("late echoes of two earlier texts do not replace what the user typed", async () => {
    const { user, input, emitted, setOwnerValue } = renderOwnedInput("", { echoChanges: false });
    await user.type(input, "mi");
    await waitForDebounce();
    await user.type(input, "ku");
    await waitForDebounce();
    await setOwnerValue("mi");
    await setOwnerValue("miku");

    await user.tab();
    expect({ emitted, shown: input.value }).toEqual({ emitted: ["mi", "miku"], shown: "miku" });
  });

  test("a late echo of earlier text that lands after the edit does not show when the user leaves", async () => {
    const { user, input, emitted, setOwnerValue } = renderOwnedInput("", { echoChanges: false });
    await user.type(input, "mi");
    await waitForDebounce();
    await user.type(input, "ku");
    await waitForDebounce();
    await setOwnerValue("mi");

    await user.tab();
    expect({ emitted, shown: input.value }).toEqual({ emitted: ["mi", "miku"], shown: "miku" });
  });

  test("text sent before the user left the field does not hide a later outside change to it", async () => {
    const { user, input, setOwnerValue } = renderOwnedInput("", { echoChanges: false });
    await user.type(input, "mi");
    await waitForDebounce();
    await user.tab();
    await user.click(input);
    await user.type(input, "ku");
    await waitForDebounce();
    await setOwnerValue("mi");

    await user.tab();
    expect(input.value).toBe("mi");
  });

  test("an outside change made while focused shows once the user leaves the field", async () => {
    const { user, input, setOwnerValue } = renderOwnedInput("");
    await user.type(input, "miku");
    await waitForDebounce();
    await setOwnerValue("rin");

    expect(input.value).toBe("miku");
    await user.tab();
    expect(input.value).toBe("rin");
  });

  test("an outside change back to earlier typed text still shows after blur", async () => {
    const { user, input, setOwnerValue } = renderOwnedInput("");
    await user.type(input, "mi");
    await waitForDebounce();
    await user.type(input, "ku");
    await waitForDebounce();
    await setOwnerValue("mi");

    await user.tab();
    expect(input.value).toBe("mi");
  });

  test("text typed after an outside change is reported when the user leaves the field at once", async () => {
    const { user, input, emitted, setOwnerValue } = renderOwnedInput("");
    await user.type(input, "mi");
    await waitForDebounce();
    await setOwnerValue("rin");
    await user.type(input, "ku");
    await user.tab();
    expect(input.value).toBe("miku");
    await waitForDebounce();

    expect({ emitted, shown: input.value }).toEqual({ emitted: ["mi", "miku"], shown: "miku" });
  });

  test("an outside change during the debounce does not replace text the user is still typing", async () => {
    const { user, input, emitted, ownerValue, setOwnerValue } = renderOwnedInput("");
    await user.type(input, "mi");
    await setOwnerValue("rin");
    await user.tab();
    expect(input.value).toBe("mi");
    await waitForDebounce();

    expect({ emitted, owner: ownerValue(), shown: input.value }).toEqual({
      emitted: ["mi"],
      owner: "mi",
      shown: "mi",
    });
  });

  test("an outside change after leaving the field with an edit pending leaves the owner and the field in agreement", async () => {
    const { user, input, emitted, ownerValue, setOwnerValue } = renderOwnedInput("");
    await user.type(input, "mi");
    await user.tab();
    await setOwnerValue("len");
    await act(() => input.focus());
    await waitForDebounce();
    await user.tab();

    expect({ emitted, owner: ownerValue(), shown: input.value }).toEqual({
      emitted: ["mi"],
      owner: "mi",
      shown: "mi",
    });
  });

  test("text reported after an outside change is what the owner and the field show after blur", async () => {
    const { user, input, ownerValue, setOwnerValue } = renderOwnedInput("");
    await user.type(input, "mi");
    await waitForDebounce();
    await setOwnerValue("rin");
    await user.type(input, "ku");
    await waitForDebounce();
    await user.tab();

    expect({ owner: ownerValue(), shown: input.value }).toEqual({ owner: "miku", shown: "miku" });
  });

  test("late echoes after leaving and returning to the field leave the owner and the field in agreement", async () => {
    const { user, input, emitted, ownerValue, setOwnerValue } = renderOwnedInput("", {
      echoChanges: false,
    });
    await user.type(input, "mi");
    await user.tab();
    await user.type(input, "ku");
    await waitForDebounce();
    for (const value of emitted) await setOwnerValue(String(value));
    await user.tab();

    expect({ owner: ownerValue(), shown: input.value }).toEqual({ owner: "miku", shown: "miku" });
  });
});
