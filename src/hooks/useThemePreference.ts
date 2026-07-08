import { useState } from 'preact/hooks';

export type Theme = 'dark' | 'light';

function findStoredTheme(): Theme | null {
  try {
    const savedTheme = localStorage.getItem('pinderive.theme');

    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme;
    }

    return null;
  } catch {
    return null;
  }
}

function storeThemePreference(theme: Theme): void {
  try {
    localStorage.setItem('pinderive.theme', theme);
  } catch {
    return;
  }
}

export function useThemePreference(): {
  theme: Theme;
  toggleTheme(): void;
} {
  const [theme, setTheme] = useState<Theme>(() => findStoredTheme() ?? 'dark');

  function toggleTheme(): void {
    const nextTheme = theme === 'light' ? 'dark' : 'light';

    storeThemePreference(nextTheme);
    setTheme(nextTheme);
  }

  return { theme, toggleTheme };
}
