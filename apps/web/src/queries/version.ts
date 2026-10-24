import { call, rejectErr } from "@/data/api";
import { app } from "@/lib/treaty-client";

export async function getVersion() {
  return call(app.api.version.get(), {
    fallback: "Failed to get version",
    policy: "bodyMessage",
  }).then(rejectErr);
}
