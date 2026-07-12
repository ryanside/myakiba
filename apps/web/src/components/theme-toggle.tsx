import { Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { setThemeWithTransition } from "@/lib/theme-transition";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme !== "light";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setThemeWithTransition(isDark ? "light" : "dark", setTheme)}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
    >
      <HugeiconsIcon icon={isDark ? Sun01Icon : Moon02Icon} />
    </Button>
  );
}
