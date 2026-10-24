import { tagged } from "./tagged";

type PictureRejection = "http_status" | "no_body" | "too_large" | "unknown_format";

const WHY = {
  http_status: "MFC answered with an error status",
  no_body: "the answer had no body",
  too_large: "it is over 10 MB",
  unknown_format: "its bytes are not a JPEG, PNG, GIF, WebP or AVIF image",
} as const satisfies Record<PictureRejection, string>;

export class PictureRejected extends tagged("PictureRejected")<{
  reason: PictureRejection;
  status: number;
  bytes: number | null;
  message: string;
}> {
  constructor(args: { reason: PictureRejection; status: number; bytes: number | null }) {
    const size = args.bytes === null ? "" : ` and ${args.bytes} bytes`;
    super({
      ...args,
      message: `The collector dropped the picture, answered with status ${args.status}${size}, because ${WHY[args.reason]}. The item imports without its picture. Open the picture's URL to see what MFC serves.`,
    });
  }
}
