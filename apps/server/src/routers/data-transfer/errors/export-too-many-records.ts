import { Failure } from "@/domain/failure";
import { DATA_TRANSFER_MAX_RECORDS } from "@myakiba/contracts/data-transfer/schema";

export class ExportTooManyRecords extends Failure(
  "ExportTooManyRecords",
  "payload_too_large",
  `The export exceeds the ${DATA_TRANSFER_MAX_RECORDS} record limit.`,
) {}
