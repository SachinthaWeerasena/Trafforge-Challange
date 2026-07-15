"use client";

import { useEffect } from "react";

/** Avoid flash of wrong theme before hydration */
export function ThemeScript() {
  useEffect(() => {
    /* ThemeProvider applies on mount; script in layout handles pre-hydration */
  }, []);
  return null;
}

export const themeInitScript = `
(function(){
  try {
    var k = 'finsight-theme';
    var s = localStorage.getItem(k);
    var m = s === 'light' || s === 'dark' ? s
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', m);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;
