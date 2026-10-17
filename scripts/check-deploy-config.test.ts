import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const checker = path.join(import.meta.dir, "check-deploy-config.ts");
const envModules = path.resolve(import.meta.dir, "../packages/env/node_modules");

const ref = (name: string): string => `\${${name}}`;

const schema = (
  client: string,
  before = "",
): string => `import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
${before}
export const env = createEnv({
  clientPrefix: "VITE_",
  client: { ${client} },
  runtimeEnv: import.meta.env,
});
`;

const webBuild = `FROM oven/bun:1.4.0-debian AS build
ARG VITE_API_URL
ENV VITE_API_URL=\${VITE_API_URL:?VITE_API_URL_required}
WORKDIR /app/apps/web
RUN bun run build
FROM gcr.io/distroless/base-debian12 AS runner
`;

const composeWith = (args: string, extra = ""): string => `services:
  server:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
      args:
${args}
${extra}`;

const workflowWith = (dockerfile: string, value: string): string => `jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include:
          - image: server
            dockerfile: ${dockerfile}
            build_args: |
              VITE_API_URL=${value}
    steps:
      - uses: docker/build-push-action@v7
        with:
          file: ${ref("{ matrix.dockerfile }")}
          push: true
          build-args: ${ref("{ matrix.build_args }")}
`;

type Tree = { web?: string; dockerfile?: string; compose?: string; workflow?: string };

type CheckRun = { code: number; out: string };

function check(tree: Tree): CheckRun {
  const dir = mkdtempSync(path.join(tmpdir(), "check-deploy-config-"));
  mkdirSync(path.join(dir, "packages/env/src"), { recursive: true });
  mkdirSync(path.join(dir, "apps/server"), { recursive: true });
  symlinkSync(envModules, path.join(dir, "packages/env/node_modules"));
  writeFileSync(
    path.join(dir, "packages/env/src/web.ts"),
    tree.web ?? schema("VITE_API_URL: z.url(), VITE_BUILD_ID: z.string().optional()"),
  );
  writeFileSync(path.join(dir, "apps/server/Dockerfile"), tree.dockerfile ?? webBuild);
  writeFileSync(
    path.join(dir, "docker-compose.yml"),
    tree.compose ?? composeWith(`        VITE_API_URL: ${ref("VITE_API_URL")}`),
  );
  if (tree.workflow) {
    mkdirSync(path.join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(path.join(dir, ".github/workflows/build.yml"), tree.workflow);
  }
  const run = Bun.spawnSync(["bun", checker], { cwd: dir });
  return { code: run.exitCode, out: `${run.stdout.toString()}${run.stderr.toString()}` };
}

describe("check-deploy-config", () => {
  test("passes a build that passes every required VITE_* arg", () => {
    const { code, out } = check({});
    expect(out).toContain("deploy config ok");
    expect(out).toContain("required VITE_API_URL");
    expect(code).toBe(0);
  });

  test("reads required vars from the schema, including spreads", () => {
    const { code, out } = check({
      web: schema("...extra, VITE_API_URL: z.url()", "const extra = { VITE_NEW_URL: z.url() };"),
    });
    expect(out).toContain("missing VITE_NEW_URL");
    expect(code).toBe(1);
  });

  test("fails when no client var is required", () => {
    const { code, out } = check({ web: schema("VITE_BUILD_ID: z.string().optional()") });
    expect(out).toContain("found no required VITE_* variable");
    expect(code).toBe(1);
  });

  test("fails closed when the schema cannot load", () => {
    const { code, out } = check({
      web: schema("VITE_API_URL: z.url()", 'import "./missing-module";'),
    });
    expect(out).toContain("packages/env/src/web.ts:3: could not load packages/env/src/web.ts");
    expect(code).toBe(1);
  });

  test("needs the VITE_* ARG in the stage that runs the web build", () => {
    const { code, out } = check({
      dockerfile: `FROM oven/bun:1.4.0-debian AS other\nARG VITE_API_URL\n${webBuild.replace("ARG VITE_API_URL\n", "")}`,
    });
    expect(out).toContain(
      'apps/server/Dockerfile:6: VITE_API_URL is required in packages/env/src/web.ts, but it is not an ARG in stage "build"',
    );
    expect(code).toBe(1);
  });

  test("accepts a VITE_* ARG from the stage the web build is FROM", () => {
    const { code, out } = check({
      dockerfile: `FROM oven/bun:1.4.0-debian AS values\nARG VITE_API_URL\n${webBuild.replace("ARG VITE_API_URL\n", "").replace("FROM oven/bun:1.4.0-debian AS build", "FROM values AS build")}`,
    });
    expect(out).toContain("deploy config ok");
    expect(code).toBe(0);
  });

  test("fails when nothing builds a Dockerfile that builds the web app", () => {
    const { code, out } = check({ compose: "services:\n  redis:\n    image: redis:8.8.0\n" });
    expect(out).toContain(
      "apps/server/Dockerfile:5: builds apps/web, but no compose service or workflow builds this image",
    );
    expect(code).toBe(1);
  });

  test("fails when a build names a Dockerfile that does not exist", () => {
    const { code, out } = check({
      compose: composeWith(`        VITE_API_URL: ${ref("VITE_API_URL")}`).replace(
        "apps/server/Dockerfile",
        "apps/nope/Dockerfile",
      ),
    });
    expect(out).toContain("builds apps/nope/Dockerfile, which does not exist");
    expect(code).toBe(1);
  });

  test("needs an ARG that the Dockerfile requires with a :? expansion", () => {
    const { code, out } = check({
      dockerfile: webBuild.replace(
        "RUN bun run build",
        `ARG NEEDED_X\nRUN test -n "\${NEEDED_X:?x}"\nRUN bun run build`,
      ),
    });
    expect(out).toContain("missing NEEDED_X (apps/server/Dockerfile:5 fails the build without it)");
    expect(code).toBe(1);
  });

  test("does not let a default in an unrelated stage cover a missing arg", () => {
    const { code, out } = check({
      dockerfile: `${webBuild}FROM oven/bun:1.4.0-debian AS discarded\nARG REQUIRED_VALUE=default\nFROM oven/bun:1.4.0-debian\nARG REQUIRED_VALUE\n`,
    });
    expect(out).toContain(
      'missing REQUIRED_VALUE ("ARG REQUIRED_VALUE" at apps/server/Dockerfile:8 has no default',
    );
    expect(code).toBe(1);
  });

  test("fails when a build arg is set from a differently named variable", () => {
    const { code, out } = check({
      compose: composeWith(`        VITE_API_URL: ${ref("VITE_API_URl")}`),
    });
    expect(out).toContain(
      "docker-compose.yml:6 (services.server.build.args): VITE_API_URL is set from VITE_API_URl, not from VITE_API_URL",
    );
    expect(code).toBe(1);
  });

  test("fails when a VITE_* var is set at runtime instead of at build", () => {
    const { code, out } = check({
      compose: composeWith(
        `        VITE_API_URL: ${ref("VITE_API_URL")}`,
        "    environment:\n      - VITE_BUILD_ID=x\n",
      ),
    });
    expect(out).toContain(
      "docker-compose.yml:8 (services.server.environment): VITE_BUILD_ID is set at runtime, but Vite reads it at build time",
    );
    expect(code).toBe(1);
  });

  test("reads required vars that the schema adds through extends", () => {
    const { code, out } = check({
      web: `import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
const extra = createEnv({ clientPrefix: "VITE_", client: { VITE_NEW_URL: z.url() }, runtimeEnv: import.meta.env });
export const env = createEnv({ clientPrefix: "VITE_", extends: [extra], client: { VITE_API_URL: z.url() }, runtimeEnv: import.meta.env });
`,
    });
    expect(out).toContain("missing VITE_NEW_URL");
    expect(code).toBe(1);
  });

  test("fails closed on an extends entry that createEnv did not build", () => {
    const { code, out } = check({
      web: schema("VITE_API_URL: z.url() }, extends: [{}], client2: {"),
    });
    expect(out).toContain("extends an env that createEnv did not build");
    expect(code).toBe(1);
  });

  test("checks references inside workflow expressions", () => {
    const { code, out } = check({
      workflow: workflowWith("apps/server/Dockerfile", ref("{ format('{0}', vars.VITE_API_URl) }")),
    });
    expect(out).toContain(
      '.github/workflows/build.yml:9 (jobs.build matrix entry "server" build_args): VITE_API_URL is set from VITE_API_URl',
    );
    expect(code).toBe(1);
  });

  test("names the workflow line of a Dockerfile that does not exist", () => {
    const { code, out } = check({
      workflow: workflowWith("apps/nope/Dockerfile", ref("{ vars.VITE_API_URL }")),
    });
    expect(out).toContain(
      '.github/workflows/build.yml:8 (jobs.build matrix entry "server" dockerfile): builds apps/nope/Dockerfile, which does not exist',
    );
    expect(code).toBe(1);
  });

  test("does not let a later default in the same stage cover an earlier use", () => {
    const { code, out } = check({
      dockerfile: `${webBuild}FROM oven/bun:1.4.0-debian\nARG REQUIRED_VALUE\nRUN test -n "$REQUIRED_VALUE"\nARG REQUIRED_VALUE=too_late\n`,
    });
    expect(out).toContain(
      'missing REQUIRED_VALUE ("ARG REQUIRED_VALUE" at apps/server/Dockerfile:8 has no default',
    );
    expect(code).toBe(1);
  });
});
