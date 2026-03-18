import { useTheme } from "@/components/theme-provider";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { Sun01Icon, Moon02Icon } from "@hugeicons/core-free-icons";

export function Pattern() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="text-muted-foreground"
    >
      <HugeiconsIcon
        icon={Sun01Icon}
        strokeWidth={2}
        className={cn(
          "size-4 transition-all duration-300",
          theme === "dark" ? "scale-0 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
        )}
      />
      <HugeiconsIcon
        icon={Moon02Icon}
        strokeWidth={2}
        className={cn(
          "absolute size-4 transition-all duration-300",
          theme === "dark" ? "scale-100 rotate-0 opacity-100" : "scale-0 rotate-90 opacity-0",
        )}
      />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
