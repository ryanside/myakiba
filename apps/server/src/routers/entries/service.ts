import { db } from "@/db";
import { entry } from "@/db/schema/figure";
import { like } from "drizzle-orm";

class EntriesService {
  async getEntries(search: string) {
    const entries = await db
      .select({
        id: entry.id,
        name: entry.name,
        category: entry.category,
      })
      .from(entry)
      .where(like(entry.name, `%${search}%`));

    if (!entries) {
      throw new Error("FAILED_TO_GET_ENTRIES");
    }

    return entries;
  }
}

export default new EntriesService();
