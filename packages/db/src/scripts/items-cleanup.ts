import process from "node:process";
import { SQL } from "bun";
import { env } from "@myakiba/env/shared";
import { deleteRetiredItems, planItemCleanup } from "../item-ownership/cleanup";

const flags = process.argv.slice(2);
const unknown = flags.filter((flag) => flag !== "--delete");
if (unknown.length > 0) {
  throw new Error(`items:cleanup takes only --delete, not ${unknown.join(" ")}`);
}
const remove = flags.includes("--delete");

const sql = new SQL({ url: env.DATABASE_URL });
try {
  const plan = remove ? await deleteRetiredItems(sql) : await planItemCleanup(sql);
  console.log(
    JSON.stringify(
      {
        deleted: remove,
        counts: {
          items: plan.items.length,
          releases: plan.releases.length,
          entries: plan.entries.length,
          links: plan.links.length,
          pictureKeys: plan.pictureKeys.length,
        },
        ...plan,
      },
      null,
      2,
    ),
  );
  console.error(
    remove
      ? "Deleted these rows. Picture objects are untouched."
      : "Dry run: nothing was deleted. Run `bun run items:cleanup --delete` to delete these rows.",
  );
} finally {
  await sql.close();
}
