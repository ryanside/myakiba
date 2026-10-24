import { describe, expect, test } from "bun:test";
import type { SyncSessionStatus } from "../shared/types";
import { sessionStatusToPhase, sessionStatusToTerminalState } from "./schema";

// A status outside the enum can only come from a row the schema never allowed, such as a
// renamed database value. It must stop the request loudly instead of reading as undefined.
const unknownStatus = "archived" as SyncSessionStatus;

describe("a sync session status outside the enum", () => {
  test("has no phase and panics", () => {
    expect(() => sessionStatusToPhase(unknownStatus)).toThrow(
      'Unknown sync session status "archived"',
    );
  });

  test("has no terminal state and panics", () => {
    expect(() => sessionStatusToTerminalState(unknownStatus)).toThrow(
      'Unknown sync session status "archived"',
    );
  });
});
