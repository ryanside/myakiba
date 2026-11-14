import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { Vocabulary } from "./module";

const vocabularyRouter = privateApi("/vocabulary").get("/", (ctx) =>
  serve(ctx, Vocabulary.read, {}),
);

export default vocabularyRouter;
