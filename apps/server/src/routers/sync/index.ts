import { Elysia } from "elysia";
import { Queue } from "bullmq";

export const sync = new Elysia({ prefix: "/sync" }).post("/", async () => {
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
});
