import type { InferOk } from "better-result";
import { StatusButton, useButtonStatus } from "@/components/ui/status-button";
import { useCommitAdd } from "@/data/resources/add";
import { buildCommitChoices, commitPlan } from "./commit-input";
import type { CommitIssue, CommitRow, Destination } from "./commit-input";

export type CommitAnswer = InferOk<Awaited<ReturnType<ReturnType<typeof useCommitAdd>["run"]>>>;

/** The one Add button. Its label says what the click will do. */
export function CommitButton({
  rows,
  destination,
  emailVerified,
  loading,
  onIssues,
  onCommitted,
  onDone,
}: {
  readonly rows: readonly CommitRow[];
  readonly destination: Destination;
  readonly emailVerified: boolean;
  /** Some selected rows have no summary yet, so the commit would leave them out. */
  readonly loading: boolean;
  readonly onIssues: (issues: readonly CommitIssue[]) => void;
  readonly onCommitted: (answer: CommitAnswer) => void;
  readonly onDone: () => void;
}) {
  const commit = useCommitAdd();
  const { status, run } = useButtonStatus({ successDuration: 900 });
  const plan = commitPlan(destination, rows.length, { emailVerified });

  const handleCommit = async () => {
    if (plan.kind === "done") {
      onDone();
      return;
    }
    const choices = buildCommitChoices(rows, destination);
    if (choices.isErr()) {
      onIssues(choices.error);
      return;
    }
    onIssues([]);
    const committed = await run(
      () => commit.run(choices.value),
      (result) => result.isOk(),
    );
    if (committed.isErr()) return;
    onCommitted(committed.value);
  };

  return (
    <StatusButton
      type="button"
      size="lg"
      status={status}
      disabled={plan.kind === "blocked" || loading}
      className="max-w-full min-w-0 @max-xl/bar:w-full"
      onClick={handleCommit}
    >
      <span className="block max-w-[min(70vw,26rem)] truncate" title={plan.label}>
        {plan.label}
      </span>
    </StatusButton>
  );
}
