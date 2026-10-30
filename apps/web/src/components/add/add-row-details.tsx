import { useId, useState } from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Rating } from "@/components/ui/rating";
import { Textarea } from "@/components/ui/textarea";
import type { DraftRow, RowOverrides } from "./add-draft";
import { DateField, LabeledField } from "./add-fields";
import { STATUS_DATE_LABEL, statusDateField } from "./commit-input";
import type { Ownership } from "./commit-input";

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;

const ROW_DATE_FIELDS = ["Ordered", "Paid", "Shipped", "Owned"] as const;

/** A row's own details, inline. An Order Item takes its Shop and dates from its Order. */
export function AddRowDetails({
  row,
  title,
  ownership,
  onChange,
}: {
  readonly row: DraftRow;
  readonly title: string;
  readonly ownership: Extract<Ownership, { kind: "collection" | "order" }>;
  readonly onChange: (overrides: RowOverrides) => void;
}) {
  const baseId = useId();
  const { overrides } = row;
  const shared = ownership.kind === "collection" ? ownership.shared : null;

  return (
    <div className="grid gap-4 @2xl/rows:grid-cols-2 @4xl/rows:grid-cols-3">
      <div className="grid gap-1.5">
        <span className="text-xs text-muted-foreground">Score</span>
        <Rating
          rating={overrides.score ?? 0}
          maxRating={10}
          size="lg"
          editable
          showValue
          className="flex-wrap"
          aria-label={`Score for ${title}`}
          onRatingChange={(score) => onChange({ score: score === overrides.score ? 0 : score })}
        />
      </div>

      {shared ? (
        <LabeledField id={`${baseId}-shop`} label="Shop">
          <Input
            id={`${baseId}-shop`}
            value={overrides.shop ?? ""}
            placeholder={shared.shop || "e.g., AmiAmi"}
            maxLength={200}
            onChange={(event) => onChange({ shop: event.target.value })}
          />
        </LabeledField>
      ) : null}

      {shared
        ? ROW_DATE_FIELDS.map((status) => {
            const field = statusDateField(status);
            const inherited = statusDateField(shared.status) === field ? shared.date : null;
            return (
              <DateField
                key={field}
                id={`${baseId}-${field}`}
                label={STATUS_DATE_LABEL[status]}
                value={overrides[field] === undefined ? inherited : overrides[field]}
                onChange={(value) => onChange({ [field]: value })}
              />
            );
          })
        : null}

      <TagsField
        id={`${baseId}-tags`}
        tags={overrides.tags ?? []}
        onChange={(tags) => onChange({ tags })}
      />

      <LabeledField
        id={`${baseId}-notes`}
        label="Notes"
        className="@2xl/rows:col-span-2 @4xl/rows:col-span-1"
      >
        <Textarea
          id={`${baseId}-notes`}
          value={overrides.notes ?? ""}
          rows={2}
          maxLength={5000}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </LabeledField>

      {shared ? null : (
        <p className="text-xs text-muted-foreground @2xl/rows:col-span-2 @4xl/rows:col-span-3">
          Order Items take their Shop, dates and Shipping Method from the Order.
        </p>
      )}
    </div>
  );
}

function TagsField({
  id,
  tags,
  onChange,
}: {
  readonly id: string;
  readonly tags: readonly string[];
  readonly onChange: (tags: string[]) => void;
}) {
  const [text, setText] = useState("");
  return (
    <LabeledField id={id} label="Tags">
      <div className="grid gap-2">
        <Input
          id={id}
          value={text}
          placeholder="Type a tag and press Enter"
          maxLength={MAX_TAG_LENGTH}
          disabled={tags.length >= MAX_TAGS}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const tag = text.trim();
            if (tag === "") return;
            if (!tags.includes(tag)) onChange([...tags, tag]);
            setText("");
          }}
        />
        {tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li key={tag}>
                <Badge variant="outline" className="h-6 gap-0.5 pr-0.5 pl-1.5">
                  <span className="[overflow-wrap:anywhere] whitespace-normal">{tag}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="size-5"
                    aria-label={`Remove tag ${tag}`}
                    onClick={() => onChange(tags.filter((other) => other !== tag))}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
                  </Button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </LabeledField>
  );
}
