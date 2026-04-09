type SetThemeFn = (theme: string) => void;

/**
 * Wraps a theme change with the View Transitions API so the gif mask
 * animation in index.css plays during the swap. Falls back to a plain
 * `setTheme` call when the API is unavailable.
 */
export function setThemeWithTransition(newTheme: string, setTheme: SetThemeFn): void {
  if (!document.startViewTransition) {
    setTheme(newTheme);
    return;
  }

  const resolved =
    newTheme === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : newTheme;

  document.startViewTransition(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(resolved);
    setTheme(newTheme);
  });
}
