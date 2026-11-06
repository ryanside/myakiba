import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { ReadError } from "@/lib/read-response";
import { LoadError } from "./page-states";

afterEach(cleanup);

describe("LoadError", () => {
  test.each([
    new Error("Failed to get collection"),
    new ReadError("Failed to load", 400, { cause: " " }),
    new ReadError("Failed to load", 422, { cause: { message: "Expected string" } }),
    new ReadError("Failed to load", 503, { cause: "Internal failure" }),
  ])("uses the server fallback when an error has no user message", (loadError) => {
    render(<LoadError title="Could not load" error={loadError} />);
    expect(screen.getByText("The server didn't answer.")).toBeTruthy();
    expect(screen.queryByText(/Failed to/)).toBeNull();
  });

  test("uses the server fallback when no error is supplied", () => {
    render(<LoadError title="Could not load" error={null} />);
    expect(screen.getByText("The server didn't answer.")).toBeTruthy();
  });

  test("preserves a server user message", () => {
    render(
      <LoadError
        title="Could not load"
        error={new ReadError("Failed to load", 401, { cause: "Please sign in again" })}
      />,
    );
    expect(screen.getByText("Please sign in again")).toBeTruthy();
    expect(screen.queryByText("The server didn't answer.")).toBeNull();
  });
});
