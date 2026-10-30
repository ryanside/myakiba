import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Clock02Icon } from "@hugeicons/core-free-icons";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useExtensionPrompt } from "@/lib/extension-prompt";
import type { ExtensionPrompt } from "@/lib/extension-prompt";
import { cn } from "@/lib/utils";

function describe(prompt: ExtensionPrompt) {
  switch (prompt.kind) {
    case "needs_user":
      return {
        title: "Complete the security check in the MyFigureCollection tab",
        detail:
          prompt.untilMs === null
            ? "Item details refresh once the check is done."
            : `Finish it by ${format(prompt.untilMs, "p")}. Item details refresh once the check is done.`,
      };
    case "backing_off":
      return {
        title: "MyFigureCollection asked to slow down",
        detail:
          prompt.untilMs === null
            ? "The refresh resumes shortly."
            : `The refresh resumes at ${format(prompt.untilMs, "p")}.`,
      };
    case "queued":
      return {
        title: "Waiting for the extension",
        detail: "It is finishing another refresh first.",
      };
  }
}

export function ExtensionPromptNotice() {
  const prompt = useExtensionPrompt();
  if (prompt === null) return null;
  const { title, detail } = describe(prompt);

  return (
    <Alert role="status">
      <HugeiconsIcon
        icon={prompt.kind === "needs_user" ? Alert02Icon : Clock02Icon}
        className={cn(prompt.kind === "needs_user" && "text-warning-foreground")}
      />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{detail}</AlertDescription>
    </Alert>
  );
}
