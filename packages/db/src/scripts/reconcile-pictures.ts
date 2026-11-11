import process from "node:process";
import { S3Client, SQL } from "bun";
import { env } from "@myakiba/env/pictures";
import { reconcilePictures } from "../pictures/reconcile";

const USAGE = "pictures:reconcile takes --apply, --legacy and --max-delete <count>";

function readFlags(args: readonly string[]) {
  const flags = { apply: false, legacy: false, maxDelete: 500 };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--apply") flags.apply = true;
    else if (flag === "--legacy") flags.legacy = true;
    else if (flag === "--max-delete") {
      index += 1;
      const count = Number(args[index]);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error(USAGE);
      flags.maxDelete = count;
    } else throw new Error(`${USAGE}, not ${flag}`);
  }
  return flags;
}

const flags = readFlags(process.argv.slice(2));
const bucket = new S3Client({
  bucket: env.AWS_BUCKET_NAME,
  region: env.AWS_BUCKET_REGION,
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  ...(env.S3_ENDPOINT_URL && { endpoint: env.S3_ENDPOINT_URL }),
});
const sql = new SQL({ url: env.DATABASE_URL });
try {
  const report = await reconcilePictures(sql, bucket, { ...flags, now: new Date() });
  console.log(JSON.stringify(report, null, 2));
  if (report.refused !== null) {
    console.error(report.refused);
    process.exitCode = 1;
  } else if (!flags.apply) {
    console.error(
      "Dry run: nothing was deleted. Run `bun run pictures:reconcile --apply` to delete the garbage.",
    );
  }
} finally {
  await sql.close();
}
