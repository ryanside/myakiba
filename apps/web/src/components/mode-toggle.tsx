import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon, MoonIcon, Sun01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { setThemeWithTransition } from "@/lib/theme-transition";
import { cn } from "@/lib/utils";

export function ModeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full ring-1 ring-foreground/10 bg-muted/50 py-0.5 px-1 overflow-hidden",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "size-6 rounded-full transition-colors",
          theme === "system" || theme === undefined ? "bg-foreground text-background" : "",
        )}
        onClick={() => setThemeWithTransition("system", setTheme)}
        aria-label="System theme"
      >
        <HugeiconsIcon icon={ComputerIcon} className="p-0.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "size-6 rounded-full transition-colors",
          theme === "light" ? "bg-foreground text-background" : "",
        )}
        onClick={() => setThemeWithTransition("light", setTheme)}
        aria-label="Light theme"
      >
        <HugeiconsIcon icon={Sun01Icon} className="p-0.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "size-6 rounded-full transition-colors",
          theme === "dark" ? "bg-foreground text-background" : "",
        )}
        onClick={() => setThemeWithTransition("dark", setTheme)}
        aria-label="Dark theme"
      >
        <HugeiconsIcon icon={MoonIcon} className="p-0.5" />
      </Button>
    </div>
  );
}
