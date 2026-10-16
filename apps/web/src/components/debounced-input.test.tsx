import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { DebouncedInput } from "./debounced-input";

afterEach(cleanup);

const DEBOUNCE_MS = 50;
const waitForDebounce = () =>
  act(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, DEBOUNCE_MS * 3);
      }),
  );

function renderOwnedInput(initialValue: string, { echoChanges = true } = {}) {
  const emitted: (string | number)[] = [];
  let setOwnerValue: (value: string) => void = () => {};

  function Owner() {
    const [value, setValue] = useState(initialValue);
    useEffect(() => {
      setOwnerValue = setValue;
    }, []);
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
    user: userEvent.setup({ delay: null }),
    input: screen.getByRole("textbox", { name: "Search" }) as HTMLInputElement,
    emitted,
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
    const user = userEvent.setup({ delay: null });
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
});
