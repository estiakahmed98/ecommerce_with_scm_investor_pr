"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

type ThemeMode = "light" | "dark" | "navy" | "plum";

export function ThemeSwitcher() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const changeTheme = (newTheme: ThemeMode) => {
    setTheme(newTheme);
  };

  const activeTheme = (theme === "system" ? resolvedTheme : theme) as ThemeMode | undefined;

  return (
    <div className="flex gap-2 p-2 bg-card rounded-xl border">
      <button
        onClick={() => changeTheme("navy")}
        className={`px-3 py-1 rounded-md border transition ${
          activeTheme === "navy"
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background text-foreground border-border hover:bg-accent"
        }`}
      >
        Navy
      </button>

      <button
        onClick={() => changeTheme("plum")}
        className={`px-3 py-1 rounded-md border transition ${
          activeTheme === "plum"
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background text-foreground border-border hover:bg-accent"
        }`}
      >
        Plum
      </button>
    </div>
  );
}
