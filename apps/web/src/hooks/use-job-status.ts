import { useEffect, useState, useRef } from "react";
import { client } from "@/lib/hono-client";
import * as z from "zod";

const jobStatusSchema = z.object({
  status: z.string(),
  finished: z.boolean(),
  createdAt: z.string().optional(),
});

type JobStatus = {
  status: string;
  finished: boolean;
  isFinished: boolean;
};

export function useJobStatus(jobId: string | null): JobStatus {
  const [status, setStatus] = useState<JobStatus>({
    status: "",
    finished: false,
    isFinished: true,
  });

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!jobId) {
      setStatus({
        status: "",
        finished: false,
        isFinished: true,
      });
      return;
    }

    const ws = client.api.sync.ws.$ws({
      query: {
        jobId: jobId,
      },
    });
    wsRef.current = ws;

    setStatus({
      status: "Connecting...",
      finished: false,
      isFinished: false,
    });

    ws.addEventListener("open", () => {
      console.log("WebSocket connected for job:", jobId);
      setStatus((prev) => ({
        ...prev,
        status: "Connected, waiting for updates...",
      }));
    });

    ws.addEventListener("message", (event) => {
      try {
        const parsedData = jobStatusSchema.safeParse(JSON.parse(event.data));
        if (!parsedData.success) {
          console.error("Schema validation failed:", parsedData.error);
          console.error("Received data:", event.data);
          setStatus({
            status: "Error parsing status update",
            finished: true,
            isFinished: true,
          });
          return;
        }
        console.log("Received status update:", parsedData.data);

        setStatus({
          status: parsedData.data.status,
          finished: parsedData.data.finished,
          isFinished: parsedData.data.finished,
        });
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
        setStatus({
          status: "Error parsing status update",
          finished: true,
          isFinished: true,
        });
      }
    });

    ws.addEventListener("error", (event) => {
      console.error("WebSocket error:", event);
      setStatus({
        status: "Connection error occurred",
        finished: true,
        isFinished: true,
      });
    });

    ws.addEventListener("close", () => {
      console.log("WebSocket closed for job:", jobId);
    });

    return () => {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [jobId]);

  return status;
}
