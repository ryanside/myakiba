import { itemUploadSchema, missingItemsSchema } from "@myakiba/contracts/mfc-items/schema";
import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { rateLimit } from "@/middleware/rate-limit";
import { verifiedEmail } from "@/middleware/verified-email";
import { MfcItems } from "./module";

export default privateApi("/mfc-items")
  .use(rateLimit)
  .use(verifiedEmail)
  .guard({ verifiedEmail: true })
  .post("/missing", (ctx) => serve(ctx, MfcItems.missing, ctx.body), {
    body: missingItemsSchema,
    rateLimit: "mfcLookup",
  })
  .post("/", (ctx) => serve(ctx, MfcItems.ingest, ctx.body), {
    body: itemUploadSchema,
    rateLimit: "mfcIngest",
  });
