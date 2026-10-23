import { createHash } from "node:crypto";
import path from "node:path";

export const E2E_ORIGINS = {
  WXT_MFC_ORIGIN: "http://127.0.0.1:4601",
  WXT_MFC_STATIC_ORIGIN: "http://127.0.0.1:4602",
  WXT_WEB_ORIGIN: "http://localhost:4603",
} as const;

export const UNLISTED_ORIGIN = "http://127.0.0.1:4604";

export const GATED_ID = 98_777;
export const PUBLIC_ID = 98_778;
export const MOVED_PICTURE_ID = 98_779;

const fixtures = path.join(import.meta.dir, "../../../packages/mfc/fixtures");
const fixture = (name: string) => Bun.file(path.join(fixtures, name)).text();

const signedInItem = await fixture("item-98777.html");
const signedOutNotFound = await fixture("derived-not-found-signed-out.html");
// Derived from derived-public-item.html: the same page as item 98778, so two ids differ.
const publicFixture = await fixture("derived-public-item.html");
const publicItem = publicFixture.replaceAll("98777", String(PUBLIC_ID));
const movedPictureItem = publicFixture.replaceAll("98777", String(MOVED_PICTURE_ID));
const publicPicturePath = `/upload/items/1/${PUBLIC_ID}-a1b2c.jpg`;
// Derived from derived-challenge.html: a button stands in for Cloudflare's check.
const challengeFixture = await fixture("derived-challenge.html");
const challenge = challengeFixture.replace(
  "</body>",
  `<button id="solve" onclick="document.cookie='cf_clearance=ok; path=/'; location.reload()">Verify</button></body>`,
);

function pictureBytes(seed: number): Uint8Array<ArrayBuffer> {
  const body = new Uint8Array(256 * 1024);
  for (let index = 0; index < body.length; index++)
    body[index] = (index * seed + Math.floor(index / 256)) % 256;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...body, 0xff, 0xd9]);
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const gatedPicture = pictureBytes(31);
const publicPicture = pictureBytes(17);
export const PICTURE_SHA256 = { gated: sha256(gatedPicture), public: sha256(publicPicture) };

type MockRequest = {
  readonly at: number;
  endedAt: number | null;
  aborted: boolean;
  readonly origin: string;
  readonly path: string;
  readonly mode: string | null;
  readonly site: string | null;
};
type Scenario = { signedIn: boolean; challenge: boolean; itemDelayMs: number };

export const DEFAULT_SCENARIO: Scenario = { signedIn: true, challenge: false, itemDelayMs: 0 };

const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
const jpeg = (bytes: Uint8Array<ArrayBuffer>) =>
  new Response(bytes, { headers: { "content-type": "image/jpeg" } });

export function startMocks() {
  const requests: MockRequest[] = [];
  const scenario: Scenario = { ...DEFAULT_SCENARIO };

  async function answer(request: Request, respond: (url: URL) => Response | Promise<Response>) {
    const url = new URL(request.url);
    const entry: MockRequest = {
      at: Date.now(),
      endedAt: null,
      aborted: false,
      origin: url.origin,
      path: `${url.pathname}${url.search}`,
      mode: request.headers.get("sec-fetch-mode"),
      site: request.headers.get("sec-fetch-site"),
    };
    requests.push(entry);
    request.signal.addEventListener("abort", () => {
      if (entry.endedAt !== null) return;
      entry.endedAt = Date.now();
      entry.aborted = true;
    });
    const response = await respond(url);
    entry.endedAt ??= Date.now();
    return response;
  }

  async function answerMfc(request: Request, url: URL): Promise<Response> {
    if (url.pathname.startsWith("/item/")) {
      await Promise.race([
        Bun.sleep(scenario.itemDelayMs),
        new Promise((resolve) => {
          request.signal.addEventListener("abort", resolve);
        }),
      ]);
    }
    const cookie = request.headers.get("cookie") ?? "";
    const session = cookie.includes("mfc_session=ok");
    if (url.pathname === "/" && url.searchParams.get("_tb") === "commit") {
      const ours = url.searchParams.get("objectId") === String(GATED_ID);
      return session && ours ? jpeg(gatedPicture) : html("", 404);
    }
    if (url.pathname === "/") {
      const headers: Record<string, string> = scenario.signedIn
        ? { "set-cookie": "mfc_session=ok; Path=/; SameSite=Lax" }
        : {};
      return html(
        "<!doctype html><title>MyFigureCollection</title><h1>mock MFC</h1>",
        200,
        headers,
      );
    }
    if (url.pathname === `/item/${PUBLIC_ID}`) return html(publicItem);
    if (url.pathname === `/item/${MOVED_PICTURE_ID}`) return html(movedPictureItem);
    if (url.pathname === `/item/${GATED_ID}`) {
      if (scenario.challenge && !cookie.includes("cf_clearance=ok")) {
        return html(challenge, 403, { "cf-mitigated": "challenge" });
      }
      return session ? html(signedInItem) : html(signedOutNotFound, 404);
    }
    return html(signedOutNotFound, 404);
  }

  const mfc = Bun.serve({
    port: Number(new URL(E2E_ORIGINS.WXT_MFC_ORIGIN).port),
    hostname: "127.0.0.1",
    fetch: (request) => answer(request, (url) => answerMfc(request, url)),
  });

  const mfcStatic = Bun.serve({
    port: Number(new URL(E2E_ORIGINS.WXT_MFC_STATIC_ORIGIN).port),
    hostname: "127.0.0.1",
    fetch: (request) =>
      answer(request, (url) => {
        const browsing = request.headers.get("sec-fetch-mode") === "navigate";
        const sameOrigin = request.headers.get("sec-fetch-site") === "same-origin";
        if (!browsing && !sameOrigin) return html(challenge, 403, { "cf-mitigated": "challenge" });
        if (url.pathname === `/upload/items/1/${MOVED_PICTURE_ID}-a1b2c.jpg`) {
          return Response.redirect(new URL(publicPicturePath, url.origin), 302);
        }
        return url.pathname === publicPicturePath
          ? jpeg(publicPicture)
          : new Response("not found", { status: 404 });
      }),
  });

  const page = Bun.file(path.join(import.meta.dir, "myakiba-page.html"));
  const myakiba = Bun.serve({
    port: Number(new URL(E2E_ORIGINS.WXT_WEB_ORIGIN).port),
    hostname: "localhost",
    fetch: () => html(""),
    routes: { "/": page },
  });
  const unlisted = Bun.serve({
    port: Number(new URL(UNLISTED_ORIGIN).port),
    hostname: "127.0.0.1",
    fetch: () => html(""),
    routes: { "/": page },
  });

  return {
    requests,
    scenario,
    itemRequests: () => requests.filter((request) => request.path.startsWith("/item/")),
    stop: async () => {
      await Promise.all([
        mfc.stop(true),
        mfcStatic.stop(true),
        myakiba.stop(true),
        unlisted.stop(true),
      ]);
    },
  };
}
