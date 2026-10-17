import type { db } from "./client";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
