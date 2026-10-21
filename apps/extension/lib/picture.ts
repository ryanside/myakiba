import type { PortPicture } from "@myakiba/mfc/bridge";

const MAX_PICTURE_BYTES = 10 * 1024 * 1024;

export async function readPicture(response: Response): Promise<PortPicture | null> {
  if (!response.ok) return null;
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_PICTURE_BYTES) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PICTURE_BYTES) return null;
  return { base64: bytes.toBase64(), contentType: response.headers.get("content-type") ?? "" };
}
