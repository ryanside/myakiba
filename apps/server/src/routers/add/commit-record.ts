import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Result, panic } from "better-result";
import type { AddCommitResponse } from "@myakiba/contracts/add/schema";
import { addCommit } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import { CommitIdReused } from "./errors/commit-id-reused";
import type { AddChoices } from "./model";

const expired = sql`${addCommit.createdAt} <= now() - interval '10 minutes'`;

type CommitKey = { readonly userId: string; readonly commitId: string };

const hashOf = (choices: AddChoices) =>
  createHash("sha256").update(JSON.stringify(choices)).digest("hex");

const keyOf = ({ userId, commitId }: CommitKey) =>
  and(eq(addCommit.userId, userId), eq(addCommit.commitId, commitId));

/** Deletes the viewer's expired records that no other commit holds, so a user keeps about 10 minutes of them. */
async function sweepExpired(tx: Tx, userId: string) {
  const stale = tx
    .select({ commitId: addCommit.commitId })
    .from(addCommit)
    .where(and(eq(addCommit.userId, userId), expired))
    .for("update", { skipLocked: true });
  await tx
    .delete(addCommit)
    .where(and(eq(addCommit.userId, userId), inArray(addCommit.commitId, stale)));
}

/**
 * Runs `write` at most once per commit id for 10 minutes, answering a repeat of the same choices
 * with the first answer. The record is a row of the commit's own transaction, so it exists only
 * if the commit's writes do. Claiming it is the commit's first lock: a request with an id another
 * request holds waits for that one to commit, then replays its answer, or to roll back, then
 * claims the id itself. An expired record is claimed like a missing one.
 */
export async function commitOnce<E>(
  tx: Tx,
  key: CommitKey,
  choices: AddChoices,
  write: () => Promise<Result<AddCommitResponse, E>>,
): Promise<
  Result<{ readonly answer: AddCommitResponse; readonly repeated: boolean }, E | CommitIdReused>
> {
  const bodyHash = hashOf(choices);
  // ON CONFLICT DO UPDATE locks a live record too, so no sweep deletes it before it is read.
  const claimed = await tx
    .insert(addCommit)
    .values({ ...key, bodyHash })
    .onConflictDoUpdate({
      target: [addCommit.userId, addCommit.commitId],
      set: { bodyHash, answer: null, createdAt: sql`now()` },
      setWhere: expired,
    })
    .returning({ commitId: addCommit.commitId });
  await sweepExpired(tx, key.userId);

  if (claimed.length === 0) {
    const [earlier] = await tx
      .select({ bodyHash: addCommit.bodyHash, answer: addCommit.answer })
      .from(addCommit)
      .where(keyOf(key));
    if (!earlier?.answer)
      panic(
        `Add commit ${key.commitId} has a live record without an answer, but a record commits only with its answer`,
      );
    if (earlier.bodyHash !== bodyHash) return Result.err(new CommitIdReused());
    return Result.ok({ answer: earlier.answer, repeated: true });
  }

  const written = await write();
  if (written.isErr()) return written;
  await tx.update(addCommit).set({ answer: written.value }).where(keyOf(key));
  return Result.ok({ answer: written.value, repeated: false });
}
