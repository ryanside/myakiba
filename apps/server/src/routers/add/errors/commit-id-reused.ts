import { Failure } from "@/domain/failure";

export class CommitIdReused extends Failure(
  "CommitIdReused",
  "conflict",
  "These items were already added with different choices",
) {}
