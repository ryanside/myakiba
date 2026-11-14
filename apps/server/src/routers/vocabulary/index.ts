import { renameShopSchema } from "@myakiba/contracts/vocabulary/schema";
import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { Vocabulary } from "./module";

const vocabularyRouter = privateApi("/vocabulary")
  .get("/", (ctx) => serve(ctx, Vocabulary.read, {}))
  .post("/shops/rename", (ctx) => serve(ctx, Vocabulary.renameShop, ctx.body), {
    body: renameShopSchema,
  });

export default vocabularyRouter;
