import type { StandardSchemaV1 } from "@t3-oss/env-core";
import { panic } from "better-result";

export function panicOnInvalidEnv(issues: readonly StandardSchemaV1.Issue[]): never {
  console.error("❌ Invalid environment variables:", issues);
  const names = new Set(
    issues.flatMap(({ path }) => (path?.[0] === undefined ? [] : [String(path[0])])),
  );
  return panic(
    `Invalid environment variables: ${[...names].join(", ")}. The process cannot start with them. Fix each one as the issues printed above describe.`,
  );
}
