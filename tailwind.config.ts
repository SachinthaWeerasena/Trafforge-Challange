import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        teal: "var(--teal)",
        "teal-deep": "var(--teal-deep)",
        "teal-glow": "var(--teal-glow)",
        danger: "var(--danger)",
        background: "var(--bg)",
        foreground: "var(--text-primary)",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "Manrope", "system-ui", "sans-serif"],
        display: ["var(--font-manrope)", "Manrope", "system-ui", "sans-serif"],
        body: ["var(--font-manrope)", "Manrope", "system-ui", "sans-serif"],
        mono: ["var(--font-manrope)", "Manrope", "system-ui", "sans-serif"],
      },
      fontSize: {
        xs: "12px",
        sm: "14px",
        base: "16px",
        lg: "20px",
        xl: "28px",
        "2xl": "40px",
      },
      borderRadius: {
        card: "18px",
      },
    },
  },
  plugins: [],
};
export default config;
