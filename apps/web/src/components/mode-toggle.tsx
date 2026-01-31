import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ModeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 px-1 overflow-hidden",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "size-6 rounded-lg transition-all hover:bg-transparent",
          theme === "system" || theme === undefined
            ? "bg-card text-card-foreground border hover:bg-card"
            : "",
        )}
        onClick={() => setTheme("system")}
        aria-label="System theme"
      >
        <Monitor className="p-0.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "size-6 rounded-full transition-all hover:bg-transparent",
          theme === "light" ? "bg-card text-card-foreground border hover:bg-card" : "",
        )}
        onClick={() => setTheme("light")}
        aria-label="Light theme"
      >
        <Sun className="p-0.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "size-6 rounded-full transition-all hover:bg-transparent",
          theme === "dark" ? "bg-card text-card-foreground border hover:bg-card" : "",
        )}
        onClick={() => setTheme("dark")}
        aria-label="Dark theme"
      >
        <Moon className="p-0.5" />
      </Button>
    </div>
  );
}
