import { itemUploadSchema, missingItemsSchema } from "@myakiba/contracts/mfc-items/schema";
import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { rateLimit } from "@/middleware/rate-limit";
import { verifiedEmail } from "@/middleware/verified-email";
import { MfcItems } from "./module";

export const createMfcItemsRouter = (items: typeof MfcItems) =>
  privateApi("/mfc-items")
    .use(rateLimit)
    .use(verifiedEmail)
    .guard({ verifiedEmail: true })
    .post("/missing", (ctx) => serve(ctx, items.missing, ctx.body), {
      body: missingItemsSchema,
      rateLimit: "mfcLookup",
    })
    .post("/", (ctx) => serve(ctx, items.ingest, ctx.body), {
      body: itemUploadSchema,
      rateLimit: "mfcIngest",
    });

export default createMfcItemsRouter(MfcItems);
