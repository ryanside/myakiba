import { expect, test } from "bun:test";
import path from "node:path";
import { $ } from "bun";

const repoRoot = path.resolve(import.meta.dir, "../..");
const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");

type RuleSetting = string | [string, ...unknown[]];
type PrintedConfig = {
  options: { typeAware?: boolean };
  rules: Record<string, RuleSetting>;
  overrides: { rules?: Record<string, RuleSetting> }[];
};

test("the type-aware pass runs typescript/no-floating-promises and no other type-aware rule", async () => {
  const rules: { scope: string; value: string; type_aware: boolean }[] =
    await $`${oxlint} --rules -f json`.cwd(repoRoot).json();
  const typeAware = new Set(
    rules.filter((rule) => rule.type_aware).map((rule) => `${rule.scope}/${rule.value}`),
  );
  const config: PrintedConfig = await $`${oxlint} --print-config`.cwd(repoRoot).json();
  const enabled = [config, ...config.overrides]
    .flatMap((block) => Object.entries(block.rules ?? {}))
    .filter(([name, setting]) => typeAware.has(name) && [setting].flat()[0] !== "allow")
    .map(([name]) => name);

  expect(config.options.typeAware).toBe(true);
  expect([...new Set(enabled)]).toEqual(["typescript/no-floating-promises"]);
});
