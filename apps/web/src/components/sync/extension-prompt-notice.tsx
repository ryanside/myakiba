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
        detail: "The import continues once the check is done.",
      };
    case "backing_off":
      return {
        title: "MyFigureCollection asked to slow down",
        detail:
          prompt.untilMs === null
            ? "The import resumes shortly."
            : `The import resumes at ${format(prompt.untilMs, "p")}.`,
      };
    case "queued":
      return {
        title: "Waiting for the extension",
        detail: "It is finishing an import from another tab first.",
      };
  }
}

export function ExtensionPromptNotice({
  sessionId,
  className,
}: {
  readonly sessionId?: string;
  readonly className?: string;
}) {
  const prompt = useExtensionPrompt(sessionId);
  if (prompt === null) return null;
  const { title, detail } = describe(prompt);

  return (
    <Alert className={className} role="status">
      <HugeiconsIcon
        icon={prompt.kind === "needs_user" ? Alert02Icon : Clock02Icon}
        className={cn(prompt.kind === "needs_user" && "text-warning-foreground")}
      />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{detail}</AlertDescription>
    </Alert>
  );
}
