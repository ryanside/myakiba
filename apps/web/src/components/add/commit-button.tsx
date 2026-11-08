import type { InferOk } from "better-result";
import { StatusButton, useButtonStatus } from "@/components/ui/status-button";
import { useGlide } from "@/hooks/use-glide";
import { useCommitAdd } from "@/data/resources/add";
import { cn } from "@/lib/utils";
import { buildCommitChoices, commitPlan } from "./commit-input";
import { BUTTON_WORDS, Swap } from "./destination-motion";
import { FULL_LABEL, SHORT_LABEL } from "./sentence-fit";
import type { CommitIssue, CommitRow, Destination } from "./commit-input";

export type CommitAnswer = InferOk<Awaited<ReturnType<ReturnType<typeof useCommitAdd>["run"]>>>;

/** The one Add button, at the end of the sentence. Its label says what the click will do. */
export function CommitButton({
  userId,
  rows,
  count,
  destination,
  emailVerified,
  loading,
  onIssues,
  onSending,
  onFailed,
  onCommitted,
  onDone,
}: {
  /** The signed-in account, whose unanswered commit a retry reuses. */
  readonly userId: string;
  readonly rows: readonly CommitRow[];
  /** How many rows it will add, known before `rows` have their Items. */
  readonly count: number;
  readonly destination: Destination;
  readonly emailVerified: boolean;
  /** Some selected rows have no summary yet, so the commit would leave them out. */
  readonly loading: boolean;
  readonly onIssues: (issues: readonly CommitIssue[]) => void;
  readonly onSending: () => void;
  readonly onFailed: () => void;
  readonly onCommitted: (answer: CommitAnswer) => void;
  readonly onDone: () => void;
}) {
  const commit = useCommitAdd(userId);
  const { status, run } = useButtonStatus({ successDuration: 900 });
  const plan = commitPlan(destination, count, { emailVerified });
  const glide = useGlide<HTMLDivElement>(plan.label);

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
    onSending();
    const committed = await run(
      () => commit.run(choices.value),
      (result) => result.isOk(),
    );
    if (committed.isErr()) {
      onFailed();
      return;
    }
    onCommitted(committed.value);
  };

  return (
    <div ref={glide} className="ms-auto flex">
      <StatusButton
        type="button"
        status={status}
        disabled={plan.kind === "blocked" || loading}
        className="w-full min-w-0"
        onClick={handleCommit}
      >
        {/* A narrow row shows only the verb, and a screen reader always hears the whole label. Each
        swaps on its own change, so a resize that trades one for the other moves nothing. */}
        <span className={cn(FULL_LABEL, "max-w-[min(70vw,26rem)]")}>
          {/* Two unseen copies size it: the label, free to break at any letter, asks for its whole
          width, and the verb, which cannot break, is the least it takes. The shown label is cut
          short to the room they get. */}
          <span
            aria-hidden="true"
            className={cn(SIZER, "whitespace-normal [overflow-wrap:anywhere]")}
          >
            {plan.label}
          </span>
          <span aria-hidden="true" className={SIZER}>
            {plan.verb}…
          </span>
          <span className="col-start-1 row-start-1 w-0 min-w-full truncate" title={plan.label}>
            <Swap move={BUTTON_WORDS} id={plan.label} className="truncate">
              {plan.label}
            </Swap>
          </span>
        </span>
        <span aria-hidden="true" className={SHORT_LABEL}>
          <Swap move={BUTTON_WORDS} id={plan.verb}>
            {plan.verb}
          </Swap>
        </span>
      </StatusButton>
    </div>
  );
}

const SIZER = "invisible col-start-1 row-start-1 h-0 overflow-hidden";
