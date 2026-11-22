import { expect, test } from "bun:test";
import { generateUsername, isGeneratedUsername } from "./generated-username";

test("a username the server generates is recognized as generated", () => {
  expect(isGeneratedUsername(generateUsername())).toBe(true);
});

test("a username a person chose is not generated", () => {
  for (const username of [
    "collector",
    "user",
    "user123",
    "username_fan",
    "userk9x2b7q3m4n5p6r7s8t9u",
  ]) {
    expect(isGeneratedUsername(username), username).toBe(false);
  }
});
