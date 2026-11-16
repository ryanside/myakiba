import * as z from "zod";
import { ITEM_FILL } from "../collection/fill";
import { idListSchema } from "../shared/write-limits";
import { ORDER_CASCADE_OPTIONS } from "./constants";

/** An Order fill writes its field to each Order and cascades it to the Order's items. */
const orderFillSchema = z.union(ORDER_CASCADE_OPTIONS.map((field) => ITEM_FILL[field]));

export type OrderFill = z.infer<typeof orderFillSchema>;

export const fillOrdersBodySchema = z.strictObject({
  orderIds: idListSchema,
  fill: orderFillSchema,
});

export type FillOrdersBody = z.infer<typeof fillOrdersBodySchema>;
