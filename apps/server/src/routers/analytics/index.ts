import {
  analyticsSectionItemsQuerySchema,
  analyticsSectionParamSchema,
  analyticsSectionQuerySchema,
  analyticsSectionRelationshipsQuerySchema,
} from "@myakiba/contracts/analytics/schema";
import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import { Analytics } from "./module";

const analyticsRouter = privateApi("/analytics")
  .get("/", (ctx) => serve(ctx, Analytics.overview, {}))
  .get("/:sectionName", (ctx) => serve(ctx, Analytics.section, { ...ctx.params, ...ctx.query }), {
    params: analyticsSectionParamSchema,
    query: analyticsSectionQuerySchema,
  })
  .get(
    "/:sectionName/items",
    (ctx) => serve(ctx, Analytics.sectionItems, { ...ctx.params, ...ctx.query }),
    { params: analyticsSectionParamSchema, query: analyticsSectionItemsQuerySchema },
  )
  .get(
    "/:sectionName/relationships",
    (ctx) => serve(ctx, Analytics.sectionRelationships, { ...ctx.params, ...ctx.query }),
    { params: analyticsSectionParamSchema, query: analyticsSectionRelationshipsQuerySchema },
  );

export default analyticsRouter;
