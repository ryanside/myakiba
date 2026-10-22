import type { PortPicture } from "@myakiba/mfc/bridge";

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

async function readAtMost(body: ReadableStream<Uint8Array>, limit: number) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Only an image of a known format leaves the tab, so an HTML error page never passes as a picture. */
export async function readPicture(response: Response): Promise<PortPicture | null> {
  if (!response.ok || !response.body) return null;
  if (Number(response.headers.get("content-length")) > MAX_PICTURE_BYTES) {
    await response.body.cancel();
    return null;
  }
  const bytes = await readAtMost(response.body, MAX_PICTURE_BYTES);
  const format = bytes && FORMATS.find((candidate) => candidate.matches(bytes));
  return bytes && format ? { base64: bytes.toBase64(), contentType: format.contentType } : null;
}
