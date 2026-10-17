#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";

type ClientVar = { name: string; source: string };

type Stage = {
  name: string;
  line: number;
  parent: Stage | undefined;
  text: string;
  args: Map<string, boolean>;
};

type Dockerfile = {
  file: string;
  webBuild: { stage: Stage; line: number; argsBefore: Set<string> } | undefined;
  args: Map<string, { line: number; hasDefault: boolean; requiredByUse: boolean }>;
};

type Build = {
  where: string;
  argsAt: string;
  envAt: string;
  fileAt: string;
  dockerfile: string;
  publishes: boolean;
  args: Map<string, string>;
  runtimeEnv: Set<string>;
  references: (value: string) => string[];
};

type ComposeList = Record<string, string | null> | string[];

type Compose = {
  services?: Record<
    string,
    {
      build?: { context?: string; dockerfile?: string; args?: ComposeList };
      environment?: ComposeList;
    }
  >;
};

type Workflow = {
  jobs?: Record<
    string,
    {
      strategy?: { matrix?: { include?: Record<string, string>[] } };
      steps?: {
        uses?: string;
        with?: { context?: string; file?: string; push?: boolean | string; "build-args"?: string };
      }[];
    }
  >;
};

type ClientVars = { ok: true; vars: ClientVar[] } | { ok: false; error: string };

type EnvSchema = { safeParse: (value?: undefined) => { success: boolean } };

type EnvOptions = { client?: Record<string, EnvSchema>; extends?: object[] };

const read = (file: string): string => readFileSync(file, "utf-8");

const assignments = (list: ComposeList = []): Map<string, string> =>
  new Map(
    Array.isArray(list)
      ? list.map((item) => [item.replace(/[=].*$/s, "").trim(), item.replace(/^[^=]*=?/, "")])
      : Object.entries(list).map(([key, value]) => [key, value ?? ""]),
  );

function nestedKeyLine(file: string, ...anchors: string[]): number {
  let found = 0;
  let line = 0;
  for (const [index, text] of read(file).split("\n").entries())
    if (found < anchors.length && text.includes(anchors[found] ?? "")) {
      found++;
      line = index + 1;
    }
  return line;
}

async function requiredClientVars(): Promise<ClientVars> {
  if (!existsSync("packages/env")) return { ok: true, vars: clientVarsBeforePackagesEnv() };
  const source = "packages/env/src/web.ts";
  if (!existsSync(source))
    return {
      ok: false,
      error: `${source} does not exist. If the client env moved, point requiredClientVars in scripts/check-deploy-config.ts at its file.`,
    };
  const calls = new Map<object, EnvOptions>();
  Bun.plugin({
    name: "read-client-env-schema",
    setup(build) {
      build.module("@t3-oss/env-core", () => ({
        exports: {
          createEnv: (options: EnvOptions) => {
            const env = {};
            calls.set(env, options);
            return env;
          },
        },
        loader: "object",
      }));
    },
  });
  let exported: { env?: object };
  try {
    exported = await import(path.resolve(source));
  } catch (error) {
    return {
      ok: false,
      error: `${loadErrorAt(Bun.inspect(error), source)}: could not load ${source} to read its client schema (${String(error)}). Run bun install first if a package is missing.`,
    };
  }
  const options = exported.env ? calls.get(exported.env) : undefined;
  if (!options)
    return {
      ok: false,
      error: `${source}:1: does not export env = createEnv(...), so the checker cannot read its client schema.`,
    };
  const client: Record<string, EnvSchema> = {};
  const merge = (current: EnvOptions): string | undefined => {
    for (const base of current.extends ?? []) {
      const extended = calls.get(base);
      if (!extended) return "extends an env that createEnv did not build";
      const problem = merge(extended);
      if (problem) return problem;
    }
    Object.assign(client, current.client);
    return undefined;
  };
  const problem = merge(options);
  if (problem)
    return {
      ok: false,
      error: `${source}:${nestedKeyLine(source, "extends")}: ${problem}, so the checker cannot read its client schema.`,
    };
  return {
    ok: true,
    vars: Object.entries(client)
      .filter(([, schema]) => !schema.safeParse().success)
      .map(([name]) => ({ name, source })),
  };
}

function loadErrorAt(report: string, source: string): string {
  const cwd = realpathSync(".");
  const thrown = /at (\/\S+):(\d+):\d+/.exec(report);
  if (thrown?.[1]) return `${path.relative(cwd, thrown[1])}:${thrown[2]}`;
  const missing = /Cannot find module '([^']+)' from '([^']+)'/.exec(report);
  if (missing?.[1] && missing[2]) {
    const file = path.relative(cwd, missing[2]);
    return `${file}:${nestedKeyLine(file, `"${missing[1]}"`) || nestedKeyLine(file, `'${missing[1]}'`) || 1}`;
  }
  return `${source}:1`;
}

function clientVarsBeforePackagesEnv(): ClientVar[] {
  const names = new Set<string>();
  for (const file of new Bun.Glob("apps/web/src/**/*.{ts,tsx}").scanSync())
    for (const [, name = ""] of read(file).matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g))
      names.add(name);
  return [...names].map((name) => ({ name, source: "apps/web/src" }));
}

function parseDockerfile(file: string): Dockerfile {
  const lines = read(file).split("\n");
  const globalDefaults = new Set<string>();
  const stages: Stage[] = [];
  const argLines = new Map<string, number>();
  lines.forEach((line, index) => {
    const from = /^\s*FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if (from) {
      const base = from[1]?.toLowerCase();
      stages.push({
        name: from[2]?.toLowerCase() ?? `stage ${stages.length}`,
        line: index + 1,
        parent: stages.find((stage) => stage.name === base),
        text: "",
        args: new Map(),
      });
      return;
    }
    const stage = stages.at(-1);
    const arg = /^\s*ARG\s+(\w+)(=\S*)?/.exec(line);
    if (!stage) {
      if (arg?.[2]) globalDefaults.add(arg[1] ?? "");
      return;
    }
    stage.text += `${line}\n`;
    if (!arg) return;
    const name = arg[1] ?? "";
    // A later ARG X=default does not reach uses of X earlier in the stage.
    if (!stage.args.has(name)) stage.args.set(name, Boolean(arg[2]) || globalDefaults.has(name));
    if (!argLines.has(name)) argLines.set(name, index + 1);
  });

  // A stage sees the ARGs, and their defaults, of the stages it is built FROM.
  const hasDefault = (stage: Stage | undefined, name: string): boolean =>
    stage !== undefined && (stage.args.get(name) === true || hasDefault(stage.parent, name));

  const args: Dockerfile["args"] = new Map();
  for (const stage of stages)
    for (const name of stage.args.keys()) {
      const previous = args.get(name);
      args.set(name, {
        line: argLines.get(name) ?? stage.line,
        hasDefault: (previous?.hasDefault ?? true) && hasDefault(stage, name),
        requiredByUse: (previous?.requiredByUse ?? false) || stage.text.includes(`\${${name}:?`),
      });
    }

  const fullText = lines.join("\n");
  const webIndex = lines.findIndex((line) =>
    /\b(bun run build|vite build|turbo (run )?build)/.test(line),
  );
  const webStage = stages.toReversed().find((stage) => stage.line - 1 < webIndex);
  let webBuild: Dockerfile["webBuild"];
  if (/apps\/web/.test(fullText) && webIndex !== -1 && webStage) {
    const argsBefore = new Set<string>();
    for (let index = webStage.line; index < webIndex; index++) {
      const name = /^\s*ARG\s+(\w+)/.exec(lines[index] ?? "")?.[1];
      if (name) argsBefore.add(name);
    }
    for (let stage = webStage.parent; stage; stage = stage.parent)
      for (const name of stage.args.keys()) argsBefore.add(name);
    webBuild = { stage: webStage, line: webIndex + 1, argsBefore };
  }
  return { file, webBuild, args };
}

const composeReferences = (value: string): string[] =>
  [...value.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)].map(([, name = ""]) => name);

const workflowReferences = (value: string): string[] =>
  [...value.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].flatMap(([, expression = ""]) =>
    [
      ...expression.matchAll(/\b(?:vars|secrets|env|inputs)(?:\.(\w+)|\[\s*['"](\w+)['"]\s*\])/g),
    ].map(([, dotted, bracketed]) => dotted ?? bracketed ?? ""),
  );

function workflowBuilds(): Build[] {
  const dir = ".github/workflows";
  if (!existsSync(dir)) return [];
  const builds: Build[] = [];
  for (const name of readdirSync(dir).filter((file) => /\.ya?ml$/.test(file))) {
    const file = `${dir}/${name}`;
    const workflow = Bun.YAML.parse(read(file)) as Workflow;
    for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
      const entries = job.strategy?.matrix?.include ?? [{}];
      for (const step of job.steps ?? []) {
        if (!step.uses?.startsWith("docker/build-push-action")) continue;
        const inputs = step.with ?? {};
        for (const entry of entries) {
          const resolve = (value = ""): string =>
            value.replaceAll(
              /\$\{\{\s*matrix\.(\w+)\s*\}\}/g,
              (_, key: string) => entry[key] ?? "",
            );
          const matrixKey = (input = ""): string | undefined =>
            /\$\{\{\s*matrix\.(\w+)\s*\}\}/.exec(input)?.[1];
          const jobAt = ["jobs:", `  ${jobId}:`];
          const entryAt = entry.image ? [...jobAt, `image: ${entry.image}`] : jobAt;
          const label = `jobs.${jobId}${entry.image ? ` matrix entry "${entry.image}"` : ""}`;
          const argsKey = matrixKey(inputs["build-args"]);
          const fileKey = matrixKey(inputs.file);
          const argsLine = argsKey
            ? nestedKeyLine(file, ...entryAt, `${argsKey}:`)
            : nestedKeyLine(file, ...jobAt, "build-args:");
          const fileLine = fileKey
            ? nestedKeyLine(file, ...entryAt, `${fileKey}:`)
            : nestedKeyLine(file, ...jobAt, inputs.file ? "file:" : "context:");
          builds.push({
            where: `${file}:${nestedKeyLine(file, ...entryAt)} (${label})`,
            argsAt: `${file}:${argsLine} (${label} ${argsKey ?? "build-args"})`,
            envAt: `${file}:${nestedKeyLine(file, ...entryAt)} (${label})`,
            fileAt: `${file}:${fileLine} (${label} ${fileKey ?? "file"})`,
            // build-push-action reads file from the checkout root, not from context.
            dockerfile: path.normalize(
              resolve(inputs.file) || path.join(resolve(inputs.context) || ".", "Dockerfile"),
            ),
            publishes: Boolean(inputs.push) && inputs.push !== "false",
            args: assignments(
              resolve(inputs["build-args"])
                .split("\n")
                .filter((item) => item.trim()),
            ),
            runtimeEnv: new Set(),
            references: workflowReferences,
          });
        }
      }
    }
  }
  return builds;
}

function composeBuilds(deployedByWorkflow: Set<string>): Build[] {
  const builds: Build[] = [];
  for (const file of readdirSync(".").filter((name) => /^(docker-)?compose.*\.ya?ml$/.test(name))) {
    const compose = Bun.YAML.parse(read(file)) as Compose;
    for (const [service, { build, environment }] of Object.entries(compose.services ?? {})) {
      if (!build) continue;
      const dockerfile = path.normalize(
        path.join(build.context ?? ".", build.dockerfile ?? "Dockerfile"),
      );
      const line = build.args
        ? nestedKeyLine(file, "services:", `  ${service}:`, "args:")
        : nestedKeyLine(file, "services:", `  ${service}:`, "build:");
      builds.push({
        where: `${file}:${nestedKeyLine(file, "services:", `  ${service}:`)} (services.${service})`,
        argsAt: `${file}:${line} (services.${service}.build.args)`,
        fileAt: `${file}:${nestedKeyLine(file, "services:", `  ${service}:`, build.dockerfile ? "dockerfile:" : "build:")} (services.${service}.build)`,
        envAt: `${file}:${nestedKeyLine(file, "services:", `  ${service}:`, "environment:")} (services.${service}.environment)`,
        dockerfile,
        publishes: !deployedByWorkflow.has(dockerfile),
        args: assignments(build.args),
        runtimeEnv: new Set(assignments(environment).keys()),
        references: composeReferences,
      });
    }
  }
  return builds;
}

const clientVars = await requiredClientVars();
const errors: string[] = [];
const required = clientVars.ok ? clientVars.vars : [];
if (!clientVars.ok) errors.push(clientVars.error);
else if (required.length === 0)
  errors.push(
    "found no required VITE_* variable in packages/env/src/web.ts. If the client env moved, point requiredClientVars in scripts/check-deploy-config.ts at its file.",
  );

if (process.argv.includes("--required-client-vars")) {
  if (errors.length > 0 || required.length === 0) {
    for (const error of errors) console.error(`ERROR ${error}`);
    process.exit(1);
  }
  for (const { name } of required) console.log(name);
  process.exit(0);
}

const workflows = workflowBuilds();
const builds = [
  ...composeBuilds(
    new Set(workflows.filter((build) => build.publishes).map((build) => build.dockerfile)),
  ),
  ...workflows,
];
for (const build of builds)
  if (!existsSync(build.dockerfile))
    errors.push(
      `${build.fileAt}: builds ${build.dockerfile}, which does not exist. Give the Dockerfile as a literal path or a matrix.include value.`,
    );
const dockerfiles = [
  ...new Set([
    ...new Bun.Glob("{apps,packages}/*/Dockerfile").scanSync(),
    ...builds.map((build) => build.dockerfile).filter((file) => existsSync(file)),
  ]),
]
  .toSorted()
  .map(parseDockerfile);

for (const dockerfile of dockerfiles) {
  const { file, webBuild } = dockerfile;
  const mine = builds.filter((build) => build.dockerfile === file);
  if (webBuild) {
    for (const { name, source } of required)
      if (!webBuild.argsBefore.has(name))
        errors.push(
          `${file}:${webBuild.line}: ${name} is required in ${source}, but it is not an ARG in stage "${webBuild.stage.name}" (line ${webBuild.stage.line}) before this web build, and Vite inlines VITE_* at that build. Add "ARG ${name}" and "ENV ${name}=\${${name}:?${name}_required}" to that stage before line ${webBuild.line}.`,
        );
    if (mine.length === 0)
      errors.push(
        `${file}:${webBuild.line}: builds apps/web, but no compose service or workflow builds this image, so no build passes its VITE_* args.`,
      );
  }

  for (const build of mine) {
    const needed = new Map<string, string>();
    if (webBuild)
      for (const { name, source } of required)
        needed.set(name, `required in ${source}, and ${file}:${webBuild.line} builds apps/web`);
    for (const [name, arg] of dockerfile.args) {
      if (needed.has(name)) continue;
      if (arg.requiredByUse) needed.set(name, `${file}:${arg.line} fails the build without it`);
      else if (build.publishes && !arg.hasDefault)
        needed.set(
          name,
          `"ARG ${name}" at ${file}:${arg.line} has no default in its stage, and this build publishes the image`,
        );
    }
    for (const [name, why] of needed) {
      const value = build.args.get(name);
      if (value === undefined) {
        errors.push(`${build.argsAt}: missing ${name} (${why}). Add ${name} there.`);
        continue;
      }
      const references = build.references(value);
      if (references.length > 0 && !references.includes(name))
        errors.push(
          `${build.argsAt}: ${name} is set from ${references.join(", ")}, not from ${name}. Reference ${name} there.`,
        );
    }
    if (webBuild)
      for (const name of build.runtimeEnv)
        if (name.startsWith("VITE_") && !build.args.has(name))
          errors.push(
            `${build.envAt}: ${name} is set at runtime, but Vite reads it at build time. Move it to ${build.argsAt}.`,
          );
  }
}

if (errors.length > 0) {
  for (const error of errors) console.log(`ERROR ${error}`);
  console.log(`deploy config: ${errors.length} error${errors.length === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log(
  `deploy config ok: ${dockerfiles.length} Dockerfiles, ${builds.length} builds, required ${required.map((v) => v.name).join(", ")}`,
);
