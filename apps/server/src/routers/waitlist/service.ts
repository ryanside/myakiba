import { db } from "@myakiba/db";
import { waitlist } from "@myakiba/db/schema/figure";
import { eq } from "drizzle-orm";

class WaitlistService {
  async isEmailOnWaitlist(email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();
    const [existing] = await db
      .select()
      .from(waitlist)
      .where(eq(waitlist.email, normalizedEmail))
      .limit(1);

    return !!existing;
  }

  async addToWaitlist(email: string): Promise<{ id: string; email: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    const [entry] = await db
      .insert(waitlist)
      .values({
        email: normalizedEmail,
      })
      .onConflictDoNothing()
      .returning();

    // If entry is undefined, email already exists
    if (!entry) {
      const [existing] = await db
        .select()
        .from(waitlist)
        .where(eq(waitlist.email, normalizedEmail))
        .limit(1);

      return { id: existing.id, email: existing.email };
    }

    return { id: entry.id, email: entry.email };
  }
}

export default new WaitlistService();
