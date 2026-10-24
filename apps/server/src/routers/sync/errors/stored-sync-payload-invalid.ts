import { Failure } from "@/domain/failure";

export class StoredSyncPayloadInvalid extends Failure(
  "StoredSyncPayloadInvalid",
  "conflict",
  (_props: { readonly sessionId: string; readonly cause: unknown }) =>
    "This import can't be retried",
) {}
