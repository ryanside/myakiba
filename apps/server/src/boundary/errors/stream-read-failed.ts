import { tagged } from "@/domain/tagged";

export class StreamReadFailed extends tagged("StreamReadFailed")<{ readonly cause: unknown }> {}
