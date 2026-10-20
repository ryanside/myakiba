import type { db } from "./client";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The read half of `Tx`. A body that holds a `ReadTx` cannot insert, update or delete. */
export type ReadTx = Pick<Tx, "select" | "selectDistinct" | "selectDistinctOn" | "$count">;
