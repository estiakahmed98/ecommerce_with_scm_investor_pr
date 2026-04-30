export type ThemeMode = "light" | "dark" | "navy" | "plum";

export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;

  root.classList.remove("light", "dark", "navy", "plum", "theme-navy", "theme-plum");

  if (theme === "light") {
    root.classList.add("light");
  } else if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "navy") {
    root.classList.add("navy");
  } else if (theme === "plum") {
    root.classList.add("plum");
  }
}

export function isDarkLikeTheme(theme?: string | null) {
  return theme === "dark" || theme === "navy" || theme === "plum";
}

export function nextHeaderTheme(theme?: string | null, resolvedTheme?: string | null): "light" | "dark" {
  const activeTheme = resolvedTheme ?? theme;
  return isDarkLikeTheme(activeTheme) ? "light" : "dark";
}
