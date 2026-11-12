import { addCommitSchema, addItemsQuerySchema } from "@myakiba/contracts/add/schema";
import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { rateLimit } from "@/middleware/rate-limit";
import { verifiedEmail } from "@/middleware/verified-email";
import { Add } from "./module";

export default privateApi("/add")
  .use(rateLimit)
  .use(verifiedEmail)
  .get("/items", (ctx) => serve(ctx, Add.items, ctx.query), { query: addItemsQuerySchema })
  .post("/commit", (ctx) => serve(ctx, Add.commit, { ...ctx.body, currency: ctx.user.currency }), {
    body: addCommitSchema,
    verifiedEmail: true,
    rateLimit: "addCommit",
  });
