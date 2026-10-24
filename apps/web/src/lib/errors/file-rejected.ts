import type { FileRejection } from "react-dropzone";
import { tagged } from "./tagged";

/**
 * The dropzone refused a file before anything read it. `code` is react-dropzone's first reason,
 * such as "file-invalid-type" or "file-too-large", and `message` is its text.
 */
export class FileRejected extends tagged("FileRejected")<{
  readonly code: string | null;
  readonly fileName: string;
  readonly message: string;
}> {
  constructor({ file, errors }: FileRejection) {
    const [first] = errors;
    super({ code: first?.code ?? null, fileName: file.name, message: first?.message ?? "" });
  }
}
