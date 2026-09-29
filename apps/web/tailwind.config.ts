import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        brand: {
          50: "#effaf6",
          100: "#d7f2e7",
          200: "#b1e4d2",
          300: "#7ecfb7",
          400: "#48b397",
          500: "#25977d",
          600: "#177a65",
          700: "#136253",
          800: "#124e44",
          900: "#10413a",
          950: "#072521",
        },
        ink: {
          DEFAULT: "#0f172a",
          muted: "#475569",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.06)",
        lift: "0 2px 4px rgba(15,23,42,0.06), 0 12px 32px rgba(15,23,42,0.10)",
      },
      borderRadius: {
        "2.5xl": "1.25rem",
      },
    },
  },
  plugins: [],
};
export default config;
