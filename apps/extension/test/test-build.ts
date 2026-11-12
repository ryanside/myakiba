import path from "node:path";
import { build } from "wxt";

type Browser = "chrome" | "firefox";

const ROOT = path.join(import.meta.dir, "..");
// The e2e suite builds `.output/*-mv3-e2e` for its own origins, so the lib tests build elsewhere and both can run at once.
const OUT_DIR = path.join(ROOT, ".output/lib-test");

/** Two cold WXT builds on a throttled CI runner take longer than Bun's 5 s hook default. */
export const BUILD_TIMEOUT_MS = 120_000;

export const testOutput = (browser: Browser) => path.join(OUT_DIR, `${browser}-mv3-e2e`);

/** Builds the e2e mode for these origins into `testOutput(browser)`. The build runs in a child, so the origins never reach this process's env. */
export async function buildForTest(
  browser: Browser,
  origins: Readonly<Record<string, string>>,
): Promise<void> {
  const child = Bun.spawn(["bun", import.meta.path, browser], {
    cwd: ROOT,
    env: { ...process.env, ...origins },
    stdout: "ignore",
    stderr: "pipe",
  });
  const stderr = await new Response(child.stderr).text();
  if ((await child.exited) !== 0) throw new Error(`the ${browser} build failed\n${stderr}`);
}

if (import.meta.main) {
  const [browser] = process.argv.slice(2);
  if (browser !== "chrome" && browser !== "firefox") throw new Error(`no browser ${browser}`);
  await build({ root: ROOT, browser, mode: "e2e", outDir: OUT_DIR });
}
