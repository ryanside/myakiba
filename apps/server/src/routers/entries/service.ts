import { db } from "@myakiba/db/client";
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

    return entries;
  }
}

export default new EntriesService();
