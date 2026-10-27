import { privateApi } from "@/boundary/private-api";
import {
  dataTransferImportItemFailureSchema,
  dataTransferImportItemUploadSchema,
  dataTransferImportRequestSchema,
  dataTransferImportRunSchema,
} from "@myakiba/contracts/data-transfer/schema";
import { serve } from "@/domain/kernel";
import { rateLimit } from "@/middleware/rate-limit";
import { verifiedEmail } from "@/middleware/verified-email";

import { DataTransfer } from "./module";

const dataTransferRouter = privateApi("/data-transfer")
  .use(rateLimit)
  .use(verifiedEmail)
  .get("/export", (ctx) => serve(ctx, DataTransfer.export, {}), { auth: true })
  .get("/imports/current", (ctx) => serve(ctx, DataTransfer.current, {}), { auth: true })
  .delete("/imports/current", (ctx) => serve(ctx, DataTransfer.remove, {}), { auth: true })
  .get(
    "/imports/current/status",
    async function* (ctx) {
      yield* serve(ctx, DataTransfer.stream, { signal: ctx.request.signal });
    },
    {
      auth: true,
    },
  )
  .post("/imports", (ctx) => serve(ctx, DataTransfer.start, ctx.body), {
    auth: true,
    body: dataTransferImportRequestSchema,
  })
  .post("/imports/current/retry", (ctx) => serve(ctx, DataTransfer.retry, {}), {
    auth: true,
  })
  .post("/imports/current/items", (ctx) => serve(ctx, DataTransfer.complete, ctx.body), {
    auth: true,
    verifiedEmail: true,
    rateLimit: "mfcIngest",
    body: dataTransferImportItemUploadSchema,
  })
  .post("/imports/current/items/failure", (ctx) => serve(ctx, DataTransfer.failure, ctx.body), {
    auth: true,
    body: dataTransferImportItemFailureSchema,
    rateLimit: "syncFailure",
  })
  .post("/imports/current/interrupt", (ctx) => serve(ctx, DataTransfer.interrupt, ctx.body), {
    auth: true,
    body: dataTransferImportRunSchema,
  })
  .post("/imports/current/heartbeat", (ctx) => serve(ctx, DataTransfer.heartbeat, ctx.body), {
    auth: true,
    body: dataTransferImportRunSchema,
  });

export default dataTransferRouter;
