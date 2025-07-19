import { Elysia, t } from "elysia";
import { Queue } from "bullmq";

export const sync = new Elysia({ prefix: "/sync" })
  .post("/", async ({ body }) => {
    console.log("Elysia: figureData:", body.figureData);

    const myQueue = new Queue("myqueue");

    try {
      console.log("Elysia: Adding job to queue");
      await myQueue.add("myJobName", { foo: "bar" });
      console.log("Elysia: Job successfully added to queue");

      return {
        message: "Job added!",
      };
    } catch (error) {
      console.error("Elysia: Failed to add job to queue:", error);
      return {
        message: "Failed to add job",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, {
    body: t.Object({
      figureData: t.Array(t.Object({
        id: t.String(),
        status: t.String(),
        count: t.Number(),
        score: t.Number(),
        payment_date: t.String(),
        shipping_date: t.String(),
        collecting_date: t.String(),
        price: t.Number(),
        shop: t.String(),
        shipping_method: t.String(),
        tracking_number: t.String(),
        note: t.String(),
      }))
    })
  })
  .get("/", () => {
    return {
      message: "Hello World",
    };
  });
