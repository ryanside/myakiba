import type * as z from "zod";
import type { addCommitSchema, addItemsQuerySchema } from "@myakiba/contracts/add/schema";

export type AddItemsQuery = z.output<typeof addItemsQuerySchema>;
export type AddCommit = z.output<typeof addCommitSchema>;
export type AddChoices = Omit<AddCommit, "commitId">;
export type AddRow = AddCommit["rows"][number];
export type AddOwnership = AddCommit["ownership"];
