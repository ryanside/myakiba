import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { initLogger } from "evlog";

const dist = await mkdtemp(path.join(tmpdir(), "html-headers-bucket-"));
await writeFile(path.join(dist, "index.html"), "<!doctype html><html><body></body></html>");
const saved = {
  STATIC_ASSETS_DIR: process.env.STATIC_ASSETS_DIR,
  S3_ENDPOINT_URL: process.env.S3_ENDPOINT_URL,
  AWS_BUCKET_URL: process.env.AWS_BUCKET_URL,
};
Object.assign(process.env, {
  STATIC_ASSETS_DIR: dist,
  S3_ENDPOINT_URL: "http://localhost:9000",
  AWS_BUCKET_URL: "http://localhost:9000/test/",
});
afterAll(async () => {
  Object.assign(process.env, saved);
  await rm(dist, { recursive: true, force: true });
});

initLogger({ enabled: false });
const { createApp } = await import("./app");

test("the web app may show pictures from the bucket's public URL, even on http", async () => {
  const app = createApp({ drain: undefined, authDocs: undefined });
  const response = await app.handle(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
  );

  const policy = response.headers.get("content-security-policy") ?? "";
  expect(policy.split("; ")).toContain("img-src 'self' data: https: http://localhost:9000");
});
