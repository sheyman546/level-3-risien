import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f3f2ff",
          100: "#e9e7ff",
          200: "#d5d2ff",
          300: "#b5adff",
          400: "#8f7eff",
          500: "#6e4dff",
          600: "#5e2bf7",
          700: "#511ee3",
          800: "#4319bf",
          900: "#38179c",
        },
        ink: {
          50: "#f6f7fb",
          100: "#e9ecf5",
          800: "#1c2333",
          900: "#12161f",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(16 24 40 / 0.06), 0 1px 3px 0 rgb(16 24 40 / 0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
