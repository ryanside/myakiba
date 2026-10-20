import type { db } from "./client";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ReadSelects = "select" | "selectDistinct" | "selectDistinctOn";

/** The read half of `Tx`. A body that holds a `ReadTx` cannot insert, update or delete. */
export type ReadTx = Pick<Tx, ReadSelects | "$count" | "$with"> & {
  readonly with: (...queries: Parameters<Tx["with"]>) => Pick<ReturnType<Tx["with"]>, ReadSelects>;
};
