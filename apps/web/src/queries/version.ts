import { call } from "@/data/api";
import { app } from "@/lib/treaty-client";

export function getVersion() {
  return call(app.api.version.get(), {
    fallback: "Failed to get version",
    empty: "Failed to get version",
    policy: "bodyMessage",
  });
}
