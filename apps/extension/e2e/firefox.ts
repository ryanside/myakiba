import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { parseJson } from "@myakiba/utils/parse-json";
import { z } from "zod";

const VERSION = "160.0";
const RELEASES_URL = `https://archive.mozilla.org/pub/firefox/releases/${VERSION}`;
const CACHE = path.join(homedir(), ".cache", "myakiba-e2e", `firefox-${VERSION}`);
const LISTEN_TIMEOUT_MS = 30_000;
const VERIFIED = ".verified-sha512";

/** `sha512` is the archive's digest from Mozilla's SHA512SUMS for this version, pinned here so a download is checked against a reviewed value, not a list the same host serves in the same run. */
type Release = {
  readonly file: string;
  readonly sha512: string;
  readonly executable: string;
  readonly unpack: (archive: string, into: string) => Promise<void>;
};

function run(command: readonly string[]): void {
  const done = Bun.spawnSync([...command]);
  if (done.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed\n${done.stderr.toString()}`);
  }
}

const MAC: Release = {
  file: `mac/en-US/Firefox ${VERSION}.dmg`,
  sha512:
    "d760a14787964825a427f400eedd4c16f17359f4e903096cc4862d04bd28ff3cc5a614d606c2c7a4fec1cbab78b74873b2e1e1032e41d203da1da684dceb0fad",
  executable: "Firefox.app/Contents/MacOS/firefox",
  async unpack(archive, into) {
    const mount = await mkdtemp(path.join(tmpdir(), "myakiba-firefox-dmg-"));
    run([
      "hdiutil",
      "attach",
      "-nobrowse",
      "-noautoopen",
      "-readonly",
      "-mountpoint",
      mount,
      archive,
    ]);
    try {
      run(["cp", "-R", path.join(mount, "Firefox.app"), into]);
    } finally {
      run(["hdiutil", "detach", mount, "-force"]);
      await rm(mount, { recursive: true, force: true });
    }
  },
};

const linux = (arch: string, sha512: string): Release => ({
  file: `linux-${arch}/en-US/firefox-${VERSION}.tar.xz`,
  sha512,
  executable: "firefox/firefox",
  async unpack(archive, into) {
    run(["tar", "-xJf", archive, "-C", into]);
  },
});

function releaseForThisMachine(): Release {
  if (process.platform === "darwin") return MAC;
  if (process.platform === "linux" && process.arch === "x64")
    return linux(
      "x86_64",
      "e9c7ed0d4abc6eb3648c2c5652bd325e690423ef49414ef201eac59c0932ea8ec52260cf652510b2c98971c7e7eb36e6be8101d87cae17c6dd28ed763bac32a6",
    );
  if (process.platform === "linux" && process.arch === "arm64")
    return linux(
      "aarch64",
      "06bd97f3bf2c8447f686387c44a46c773bac0330d90fe2e25d9064f45a65df87a0f481d70f9cca852f5e364d677cd3fd5c471c18c078b5d437364cf495674ac7",
    );
  throw new Error(
    `no Firefox ${VERSION} build this test unpacks for ${process.platform}-${process.arch}`,
  );
}

/** The pinned release Firefox, downloaded once from Mozilla and checked against its pinned SHA-512. The cache keeps the digest it was installed from, so an install from any other archive is replaced. */
export async function releaseFirefox(): Promise<string> {
  const release = releaseForThisMachine();
  const installed = path.join(CACHE, path.dirname(release.file));
  const executable = path.join(installed, release.executable);
  const verified = Bun.file(path.join(installed, VERIFIED));
  if ((await verified.exists()) && (await verified.text()) === release.sha512) return executable;

  const url = `${RELEASES_URL}/${encodeURI(release.file)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const archive = await response.bytes();
  const sha512 = new Bun.CryptoHasher("sha512").update(archive).digest("hex");
  if (sha512 !== release.sha512) {
    throw new Error(`${release.file} has SHA-512 ${sha512}, not the pinned ${release.sha512}`);
  }

  await mkdir(CACHE, { recursive: true });
  const staging = await mkdtemp(path.join(CACHE, ".partial-"));
  try {
    const saved = path.join(staging, path.basename(release.file));
    await Bun.write(saved, archive);
    const unpacked = path.join(staging, "unpacked");
    await mkdir(unpacked);
    await release.unpack(saved, unpacked);
    await Bun.write(path.join(unpacked, VERIFIED), release.sha512);
    await rm(installed, { recursive: true, force: true });
    await mkdir(path.dirname(installed), { recursive: true });
    await rename(unpacked, installed);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return executable;
}

type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };
type Params = { readonly [key: string]: Json };

const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("success"), id: z.number(), result: z.unknown() }),
  z.object({
    type: z.literal("error"),
    id: z.number().nullable(),
    error: z.string(),
    message: z.string(),
  }),
  z.object({ type: z.literal("event"), method: z.string(), params: z.unknown() }),
]);
const createdSchema = z.object({ context: z.string(), parent: z.string().nullable().optional() });
const treeSchema = z.object({ contexts: z.array(z.object({ context: z.string() })) });
const contextSchema = z.object({ context: z.string() });
const evaluatedSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("success"),
    result: z.object({ type: z.literal("string"), value: z.string() }),
  }),
  z.object({ type: z.literal("exception"), exceptionDetails: z.object({ text: z.string() }) }),
]);
const ignored = z.unknown().transform(() => {});

function freePort(): number {
  const server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const { port } = server;
  server.stop(true);
  return port;
}

async function connect(url: string, deadline: number): Promise<WebSocket> {
  for (;;) {
    const socket = new WebSocket(url);
    const opened = await new Promise<boolean>((resolve) => {
      socket.addEventListener("open", () => resolve(true), { once: true });
      socket.addEventListener("error", () => resolve(false), { once: true });
    });
    if (opened) return socket;
    if (Date.now() > deadline)
      throw new Error(`Firefox never listened for WebDriver BiDi at ${url}`);
    await Bun.sleep(100);
  }
}

/** A headless release Firefox on a fresh profile, driven over WebDriver BiDi. Playwright's Firefox cannot load extensions. */
export async function launchFirefox(executable: string) {
  const profile = await mkdtemp(path.join(tmpdir(), "myakiba-firefox-profile-"));
  const port = freePort();
  const firefox = Bun.spawn(
    [
      executable,
      "--headless",
      "--no-remote",
      "--profile",
      profile,
      `--remote-debugging-port=${port}`,
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  async function quit(): Promise<void> {
    if (firefox.exitCode === null) firefox.kill();
    await firefox.exited;
    await rm(profile, { recursive: true, force: true });
  }
  /** Quits Firefox and removes its profile when `work` fails, so a failed launch leaves nothing running. */
  async function orQuit<T>(work: Promise<T>): Promise<T> {
    try {
      return await work;
    } catch (error) {
      await quit();
      throw error;
    }
  }
  const socket = await orQuit(
    connect(`ws://127.0.0.1:${port}/session`, Date.now() + LISTEN_TIMEOUT_MS),
  );

  let lastId = 0;
  const pending = new Map<number, PromiseWithResolvers<unknown>>();
  const createdTabs = new Set<(context: string) => void>();
  socket.addEventListener("message", (event) => {
    const message = parseJson(messageSchema, String(event.data)).unwrap();
    if (message.type === "event") {
      if (message.method !== "browsingContext.contextCreated") return;
      const { context, parent } = createdSchema.parse(message.params);
      if (!parent) for (const listener of createdTabs) listener(context);
      return;
    }
    const call = message.id === null ? undefined : pending.get(message.id);
    if (message.id !== null) pending.delete(message.id);
    if (message.type === "success") call?.resolve(message.result);
    else call?.reject(new Error(`${message.error}: ${message.message}`));
  });
  socket.addEventListener("close", () => {
    for (const call of pending.values())
      call.reject(new Error("Firefox closed the WebDriver BiDi session"));
    pending.clear();
  });

  async function send<T>(method: string, params: Params, schema: z.ZodType<T>): Promise<T> {
    lastId += 1;
    const call = Promise.withResolvers<unknown>();
    pending.set(lastId, call);
    socket.send(JSON.stringify({ id: lastId, method, params }));
    return schema.parse(await call.promise);
  }

  await orQuit(
    send("session.new", { capabilities: {} }, ignored).then(() =>
      send("session.subscribe", { events: ["browsingContext.contextCreated"] }, ignored),
    ),
  );

  return {
    async installExtension(directory: string): Promise<void> {
      await send(
        "webExtension.install",
        { extensionData: { type: "path", path: directory } },
        ignored,
      );
    },

    async newTab(url: string): Promise<string> {
      const { context } = await send("browsingContext.create", { type: "tab" }, contextSchema);
      await send("browsingContext.navigate", { context, url, wait: "complete" }, ignored);
      return context;
    },

    async closeTab(context: string): Promise<void> {
      await send("browsingContext.close", { context }, ignored);
    },

    /** The tabs the browser opens while `work` runs. */
    async tabsOpenedDuring(work: () => Promise<void>): Promise<string[]> {
      const { contexts } = await send("browsingContext.getTree", { maxDepth: 0 }, treeSchema);
      const before = new Set(contexts.map(({ context }) => context));
      const opened: string[] = [];
      const listener = (context: string) => {
        if (!before.has(context)) opened.push(context);
      };
      createdTabs.add(listener);
      try {
        await work();
      } finally {
        createdTabs.delete(listener);
      }
      return opened;
    },

    /** Runs `fn` in the tab's page and answers its result, JSON-encoded there and read here with `schema`. */
    async evaluate<T, Args extends Json[]>(
      context: string,
      schema: z.ZodType<T>,
      fn: (...args: Args) => T | Promise<T>,
      ...args: Args
    ): Promise<T> {
      const answered = await send(
        "script.callFunction",
        {
          functionDeclaration: `async (args) => JSON.stringify(await (${fn.toString()})(...JSON.parse(args)))`,
          arguments: [{ type: "string", value: JSON.stringify(args) }],
          target: { context },
          awaitPromise: true,
        },
        evaluatedSchema,
      );
      if (answered.type === "exception") throw new Error(answered.exceptionDetails.text);
      return parseJson(schema, answered.result.value).unwrap();
    },

    /** A trusted click at a point of the tab's viewport, as a user's mouse makes. */
    async click(context: string, x: number, y: number): Promise<void> {
      await send(
        "input.performActions",
        {
          context,
          actions: [
            {
              type: "pointer",
              id: "mouse",
              actions: [
                { type: "pointerMove", x: Math.round(x), y: Math.round(y) },
                { type: "pointerDown", button: 0 },
                { type: "pointerUp", button: 0 },
              ],
            },
          ],
        },
        ignored,
      );
    },

    async close(): Promise<void> {
      try {
        await send("browser.close", {}, ignored);
      } catch {
        // Firefox may close the socket before it answers.
      }
      await Promise.race([firefox.exited, Bun.sleep(5000)]);
      await quit();
    },
  };
}
