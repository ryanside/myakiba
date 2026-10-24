import { tagged } from "@/domain/tagged";

/** The auth boundary retains Elysia's existing empty 401 response. */
export class Unauthenticated extends tagged("Unauthenticated")<{
  readonly message: string;
}> {
  readonly status = 401;

  constructor() {
    super({ message: "A session is required" });
  }
}
