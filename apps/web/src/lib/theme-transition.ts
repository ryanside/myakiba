type SetThemeFn = (theme: string) => void;

export function setThemeWithTransition(newTheme: string, setTheme: SetThemeFn): void {
  if (!document.startViewTransition) {
    setTheme(newTheme);
    return;
  }

  const resolveTheme = (): "dark" | "light" | typeof newTheme => {
    if (newTheme !== "system") return newTheme;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };
  const resolved = resolveTheme();

  document.startViewTransition(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(resolved);
    setTheme(newTheme);
  });
}
