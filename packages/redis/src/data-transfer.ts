import * as z from "zod";

export const dataTransferImportJobSchema = z.strictObject({
  userId: z.string().min(1).max(128),
  jobId: z.string().min(1).max(128),
});

export type DataTransferImportJobPayload = z.infer<typeof dataTransferImportJobSchema>;

export const DATA_TRANSFER_IMPORT_QUEUE_NAME = "data-transfer-import-queue";
