import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { Settings } from "./module";

const settingsRouter = privateApi("/settings").get("/account-type", (ctx) =>
  serve(ctx, Settings.accountType, {}),
);

export default settingsRouter;
