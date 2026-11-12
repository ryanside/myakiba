import process from "node:process";
import { S3Client, SQL } from "bun";
import { env } from "@myakiba/env/pictures";
import { reconcilePictures } from "../pictures/reconcile";

const USAGE = "pictures:reconcile only reports, and takes only --legacy";

const flags = process.argv.slice(2);
const unknown = flags.filter((flag) => flag !== "--legacy");
if (unknown.length > 0) throw new Error(`${USAGE}, not ${unknown.join(" ")}`);

const bucket = new S3Client({
  bucket: env.AWS_BUCKET_NAME,
  region: env.AWS_BUCKET_REGION,
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  ...(env.S3_ENDPOINT_URL && { endpoint: env.S3_ENDPOINT_URL }),
});
const sql = new SQL({ url: env.DATABASE_URL });
try {
  const report = await reconcilePictures(sql, bucket, {
    legacy: flags.includes("--legacy"),
    now: new Date(),
  });
  console.log(JSON.stringify(report, null, 2));
  console.error("Report only: pictures:reconcile deletes nothing.");
} finally {
  await sql.close();
}
