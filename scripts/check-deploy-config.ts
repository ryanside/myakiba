#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

type ClientVar = { name: string; source: string };

type Dockerfile = {
  file: string;
  buildsWeb: boolean;
  webStageArgs: Set<string>;
  args: Map<string, { hasDefault: boolean; requiredByUse: boolean }>;
};

type Build = {
  where: string;
  argsAt: string;
  dockerfile: string;
  publishes: boolean;
  args: Set<string>;
  runtimeEnv: Set<string>;
};

type ComposeList = Record<string, string> | string[];

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

const read = (file: string): string => readFileSync(file, "utf-8");

const keyOf = (assignment: string): string => assignment.replace(/[=].*$/s, "").trim();

const composeKeys = (list: ComposeList = []): string[] =>
  Array.isArray(list) ? list.map(keyOf) : Object.keys(list);

function requiredClientVars(): ClientVar[] {
  const source = "packages/env/src/web.ts";
  if (existsSync(source)) {
    const text = read(source);
    const client = text.slice(text.indexOf("client:"), text.indexOf("runtimeEnv"));
    return [...client.matchAll(/(VITE_[A-Z0-9_]+)\s*:([\s\S]*?)(?=\bVITE_[A-Z0-9_]+\s*:|$)/g)]
      .filter((match) => !/\.optional\(\)|\.default\(/.test(match[2] ?? ""))
      .map((match) => ({ name: match[1] ?? "", source }));
  }
  // Trees from before packages/env existed read VITE_* straight from import.meta.env.
  const names = new Set<string>();
  for (const file of new Bun.Glob("apps/web/src/**/*.{ts,tsx}").scanSync())
    for (const [, name = ""] of read(file).matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g))
      names.add(name);
  return [...names].map((name) => ({ name, source: "apps/web/src" }));
}

function parseDockerfile(file: string): Dockerfile {
  const text = read(file);
  const args: Dockerfile["args"] = new Map();
  for (const [, name = "", initializer] of text.matchAll(/^\s*ARG\s+(\w+)(=\S*)?/gm)) {
    args.set(name, {
      hasDefault: Boolean(initializer) || Boolean(args.get(name)?.hasDefault),
      requiredByUse: text.includes(`\${${name}:?`),
    });
  }
  const webBuild = /apps\/web/.test(text)
    ? text.search(/\b(bun run build|vite build|turbo (run )?build)/)
    : -1;
  // An ARG is visible only after its declaration in its own stage.
  const webStage =
    text
      .slice(0, Math.max(webBuild, 0))
      .split(/^FROM\s/im)
      .at(-1) ?? "";
  return {
    file,
    buildsWeb: webBuild >= 0,
    webStageArgs: new Set([...webStage.matchAll(/^\s*ARG\s+(\w+)/gm)].map(([, name = ""]) => name)),
    args,
  };
}

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
          const where = `${file} jobs.${jobId}${entry.image ? ` matrix entry "${entry.image}"` : ""}`;
          builds.push({
            where,
            argsAt: `${where} build-args`,
            // build-push-action reads file from the checkout root, not from context.
            dockerfile: path.normalize(
              resolve(inputs.file) || path.join(resolve(inputs.context) || ".", "Dockerfile"),
            ),
            publishes: Boolean(inputs.push) && inputs.push !== "false",
            args: new Set(resolve(inputs["build-args"]).split("\n").map(keyOf).filter(Boolean)),
            runtimeEnv: new Set(),
          });
        }
      }
    }
  }
  return builds;
}

function composeBuilds(publishedByWorkflow: Set<string>): Build[] {
  const builds: Build[] = [];
  for (const file of readdirSync(".").filter((name) => /^docker-compose.*\.ya?ml$/.test(name))) {
    const compose = Bun.YAML.parse(read(file)) as Compose;
    for (const [service, { build, environment }] of Object.entries(compose.services ?? {})) {
      if (!build) continue;
      const dockerfile = path.normalize(
        path.join(build.context ?? ".", build.dockerfile ?? "Dockerfile"),
      );
      builds.push({
        where: `${file} services.${service}`,
        argsAt: `${file} services.${service}.build.args`,
        dockerfile,
        // Compose was the deploy path until a workflow published the same Dockerfile.
        publishes: !publishedByWorkflow.has(dockerfile),
        args: new Set(composeKeys(build.args)),
        runtimeEnv: new Set(composeKeys(environment)),
      });
    }
  }
  return builds;
}

const clientVars = requiredClientVars();
const workflows = workflowBuilds();
const builds = [
  ...composeBuilds(
    new Set(workflows.filter((build) => build.publishes).map((build) => build.dockerfile)),
  ),
  ...workflows,
];
const errors: string[] = [];
for (const build of builds)
  if (!existsSync(build.dockerfile))
    errors.push(
      `${build.where}: builds ${build.dockerfile}, which does not exist. Give the Dockerfile as a literal path or a matrix.include value.`,
    );
const dockerfiles = [
  ...new Set([
    ...new Bun.Glob("{apps,packages}/*/Dockerfile").scanSync(),
    ...builds.map((build) => build.dockerfile).filter((file) => existsSync(file)),
  ]),
]
  .toSorted()
  .map(parseDockerfile);

if (clientVars.length === 0)
  errors.push(
    "found no required VITE_* variable in packages/env/src/web.ts. Fix the parser in scripts/check-deploy-config.ts.",
  );

for (const dockerfile of dockerfiles) {
  const mine = builds.filter((build) => build.dockerfile === dockerfile.file);
  if (dockerfile.buildsWeb) {
    for (const { name, source } of clientVars)
      if (!dockerfile.webStageArgs.has(name))
        errors.push(
          `${dockerfile.file}: ${name} is required in ${source}, but it is not an ARG in the stage that builds apps/web, and Vite inlines VITE_* at that build. Add "ARG ${name}" and "ENV ${name}=\${${name}:?${name}_required}" to that stage before the web build.`,
        );
    if (mine.length === 0)
      errors.push(
        `${dockerfile.file}: builds apps/web, but no compose service or workflow builds this image, so no build passes its VITE_* args.`,
      );
  }

  for (const build of mine) {
    const needed = new Map<string, string>();
    if (dockerfile.buildsWeb)
      for (const { name, source } of clientVars)
        needed.set(name, `required in ${source}, and ${dockerfile.file} builds apps/web`);
    for (const [name, arg] of dockerfile.args) {
      if (needed.has(name)) continue;
      if (arg.requiredByUse) needed.set(name, `${dockerfile.file} fails the build without it`);
      else if (build.publishes && !arg.hasDefault)
        needed.set(
          name,
          `"ARG ${name}" in ${dockerfile.file} has no default, and this build publishes the image`,
        );
    }
    for (const [name, why] of needed)
      if (!build.args.has(name))
        errors.push(`${build.argsAt}: missing ${name} (${why}). Add ${name} to ${build.argsAt}.`);
    if (dockerfile.buildsWeb)
      for (const name of build.runtimeEnv)
        if (name.startsWith("VITE_") && !build.args.has(name))
          errors.push(
            `${build.where}.environment: ${name} is set at runtime, but Vite reads it at build time. Move it to ${build.argsAt}.`,
          );
  }
}

if (errors.length > 0) {
  for (const error of errors) console.log(`ERROR ${error}`);
  console.log(`deploy config: ${errors.length} error${errors.length === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log(
  `deploy config ok: ${dockerfiles.length} Dockerfiles, ${builds.length} builds, required ${clientVars.map((v) => v.name).join(", ")}`,
);
