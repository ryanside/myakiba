import { expect, spyOn, test } from "bun:test";
import { Panic } from "better-result";
import { asPanic, reportDefect } from "./as-panic";

const DEFECT_TEXT = "Something went wrong. Reload the page and try again";

test("a defect's message is the safe text, and what was thrown stays its cause", () => {
  const thrown = new TypeError("cannot read properties of undefined (reading 'order')");

  const defect = asPanic(thrown);

  expect(defect.message).toBe(DEFECT_TEXT);
  expect(defect.cause).toBe(thrown);
});

test("a Panic thrown with its own message becomes a defect with the safe text", () => {
  const thrown = new Panic({ message: "map callback threw" });

  const defect = asPanic(thrown);

  expect(defect.message).toBe(DEFECT_TEXT);
  expect(defect.cause).toBe(thrown);
  expect(asPanic(defect)).toBe(defect);
});

test("a reported defect logs what was thrown", () => {
  const logged = spyOn(console, "error").mockImplementation(() => {});
  const thrown = new TypeError("cannot read properties of undefined (reading 'order')");

  reportDefect(thrown);

  const calls = logged.mock.calls;
  logged.mockRestore();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain(thrown);
});
