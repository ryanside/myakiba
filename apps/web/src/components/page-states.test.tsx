import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { ApiInvalid } from "@/lib/errors/api-invalid";
import { ApiRejected } from "@/lib/errors/api-rejected";
import { ApiServerError } from "@/lib/errors/api-server-error";
import { LoadError } from "./page-states";

afterEach(cleanup);

describe("LoadError", () => {
  test.each([
    new Error("Failed to get collection"),
    new ApiServerError({ status: 503, body: "Internal failure", message: "Failed to load" }),
  ])("uses the server fallback when an error has no user message", (loadError) => {
    render(<LoadError title="Could not load" error={loadError} />);
    expect(screen.getByText("The server didn't answer.")).toBeTruthy();
    expect(screen.queryByText(/Failed to/)).toBeNull();
  });

  test.each([
    new ApiRejected({ status: 400, body: " ", message: "Failed to load" }),
    new ApiInvalid({ body: { message: "Expected string" }, message: "Failed to load" }),
  ])("says the request was rejected when a 4xx has no user message", (loadError) => {
    render(<LoadError title="Could not load" error={loadError} />);
    expect(screen.getByText("The server rejected this request.")).toBeTruthy();
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
        error={
          new ApiRejected({ status: 401, body: "Please sign in again", message: "Failed to load" })
        }
      />,
    );
    expect(screen.getByText("Please sign in again")).toBeTruthy();
    expect(screen.queryByText("The server didn't answer.")).toBeNull();
  });
});
