import { Hono } from "hono";
import type { Variables } from "../..";
import OrdersService from "./service";

const ordersRouter = new Hono<{ Variables: Variables }>().get(
  "/",
  async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const orders = await OrdersService.getSingleItemOrders(user.id);

    return c.json({ orders });
  }
);

export default ordersRouter;
