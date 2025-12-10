import { db } from "@myakiba/db";
import { entry } from "@myakiba/db/schema/figure";
import { ilike } from "drizzle-orm";

class EntriesService {
  async getEntries(search: string) {
    const entries = await db
      .select({
        id: entry.id,
        name: entry.name,
        category: entry.category,
      })
      .from(entry)
      .where(ilike(entry.name, `%${search}%`));

    if (!entries) {
      throw new Error("FAILED_TO_GET_ENTRIES");
    }

    return entries;
  }
}

export default new EntriesService();
