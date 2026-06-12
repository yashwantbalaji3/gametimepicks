import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Broadcast palette
        ink: {
          950: "#06070A",
          900: "#0B0D12",
          800: "#13161D",
          700: "#1C1F28",
          600: "#262A35",
          500: "#3A3F4D",
          400: "#5C6373",
          300: "#878D9C",
          200: "#B5B9C4",
          100: "#E1E3E9",
          50: "#F4F4F5",
        },
        // Accents
        lime: {
          400: "#A3E635",
          500: "#84CC16",
          600: "#65A30D",
        },
        amber: {
          400: "#FBBF24",
          500: "#F59E0B",
        },
        rose: {
          400: "#FB7185",
          500: "#F43F5E",
        },
      },
      fontFamily: {
        sans: ["var(--font-display)", "system-ui", "sans-serif"],
        // `font-display` (used on headings, card titles, odds, and labels across
        // the app) now resolves to the premium geometric headline face; body text
        // without the class stays on Geist via `sans`.
        display: ["var(--font-headline)", "var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
    },
  },
  plugins: [],
};

export default config;
