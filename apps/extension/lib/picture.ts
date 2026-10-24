import type { PortPicture } from "@myakiba/mfc/bridge";
import { Result } from "better-result";
import { PictureRejected } from "./errors/picture-rejected";
import { toConfiguredUrl } from "./origins";
import type { Origins } from "./origins";

export const PICTURE_TIMEOUT_MS = 20_000;
const MAX_PICTURE_BYTES = 10 * 1024 * 1024;

const ascii = (text: string) => [...new TextEncoder().encode(text)];

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

const FORMATS = [
  { contentType: "image/jpeg", matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  {
    contentType: "image/png",
    matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    contentType: "image/gif",
    matches: (b) => startsWith(b, ascii("GIF87a")) || startsWith(b, ascii("GIF89a")),
  },
  {
    contentType: "image/webp",
    matches: (b) => startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8),
  },
  {
    contentType: "image/avif",
    matches: (b) =>
      startsWith(b, ascii("ftyp"), 4) &&
      (startsWith(b, ascii("avif"), 8) || startsWith(b, ascii("avis"), 8)),
  },
] as const satisfies readonly {
  readonly contentType: string;
  readonly matches: (bytes: Uint8Array) => boolean;
}[];

function rejected(
  reason: PictureRejected["reason"],
  status: number,
  bytes: number | null = null,
): Result<never, PictureRejected> {
  return Result.err(new PictureRejected({ reason, status, bytes }));
}

async function readAtMost(
  body: ReadableStream<Uint8Array>,
  limit: number,
  status: number,
): Promise<Result<Uint8Array, PictureRejected>> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return rejected("too_large", status, size);
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return Result.ok(bytes);
}

/** Only an image of a known format leaves the tab, so an HTML error page never passes as a picture. */
export async function readPicture(
  response: Response,
): Promise<Result<PortPicture, PictureRejected>> {
  const { status, body } = response;
  if (!response.ok) return rejected("http_status", status);
  if (!body) return rejected("no_body", status);
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_PICTURE_BYTES) {
    await body.cancel();
    return rejected("too_large", status, declared);
  }
  const read = await readAtMost(body, MAX_PICTURE_BYTES, status);
  return read.andThen((bytes) => {
    if (bytes.byteLength === 0) return rejected("no_body", status, 0);
    const format = FORMATS.find((candidate) => candidate.matches(bytes));
    return format
      ? Result.ok({ base64: bytes.toBase64(), contentType: format.contentType })
      : rejected("unknown_format", status, bytes.byteLength);
  });
}

/**
 * The picture to read in a static-origin tab, only when the tab shows the one asked for, so a redirect or a page the user
 * opened there never passes as the item's picture. Like `@myakiba/mfc/page`, it allows only pictures under `/upload/items/`.
 */
export function pictureToRead(requested: string, shown: string, origins: Origins): URL | null {
  const url = toConfiguredUrl(requested, origins);
  if (url?.origin !== origins.mfcStatic || !url.pathname.startsWith("/upload/items/")) return null;
  return URL.parse(shown)?.href === url.href ? url : null;
}
