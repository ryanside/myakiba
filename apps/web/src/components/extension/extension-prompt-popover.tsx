import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Clock02Icon } from "@hugeicons/core-free-icons";
import { ExtensionPromptNotice } from "@/components/extension/extension-prompt-notice";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useExtensionPrompt } from "@/lib/extension-prompt";
import type { ExtensionPrompt } from "@/lib/extension-prompt";

/** What the extension asks of this tab during an Item Refresh. It takes no room when it asks nothing. */
export function ExtensionPromptPopover() {
  const prompt = useExtensionPrompt();
  return prompt === null ? null : <PromptPopover prompt={prompt} />;
}

function PromptPopover({ prompt }: { readonly prompt: ExtensionPrompt }) {
  const [open, setOpen] = useState(false);
  const [closedOnPrompt, setClosedOnPrompt] = useState<ExtensionPrompt | null>(null);
  const opensForPrompt = prompt.kind === "needs_user" && prompt !== closedOnPrompt;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setClosedOnPrompt(prompt);
  };

  return (
    <Popover open={open || opensForPrompt} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button size="sm" variant="outline" className="mx-2 text-xs text-muted-foreground">
            <HugeiconsIcon
              icon={prompt.kind === "needs_user" ? Alert02Icon : Clock02Icon}
              data-icon="inline-start"
            />
            Item refresh
          </Button>
        }
      />
      <PopoverContent
        align="start"
        aria-label="Item refresh"
        className="w-80 max-w-[calc(100vw-2rem)] p-2 ease-out"
      >
        <ExtensionPromptNotice />
      </PopoverContent>
    </Popover>
  );
}
