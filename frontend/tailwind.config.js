/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand palette
        graphite: {
          DEFAULT: "#202124",
          950: "#141517",
          900: "#202124",
          800: "#2B2C30",
          700: "#3A3B40",
          600: "#55565C",
          500: "#76777D",
          400: "#9A9AA0",
        },
        persimmon: {
          DEFAULT: "#FF7849",
          600: "#E85F2F",
          500: "#FF7849",
          300: "#FFAA8B",
          100: "#FFE6DC",
          50: "#FFF4EF",
        },
        sand: {
          DEFAULT: "#F4EFE6",
          50: "#FBF9F5",
          100: "#F4EFE6",
          200: "#E9E1D3",
          300: "#DACFBC",
          400: "#BFB29C",
        },
        cobalt: {
          DEFAULT: "#4776D0",
          700: "#2F58A8",
          500: "#4776D0",
          300: "#93AEE3",
          100: "#E1E9F8",
        },
        gold: {
          DEFAULT: "#D6AD64",
          700: "#A47F3A",
          500: "#D6AD64",
          200: "#F0DEBA",
          100: "#F8EFDC",
        },
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"Instrument Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        "display-xl": ["3.5rem", { lineHeight: "1.02", letterSpacing: "-0.03em" }],
        "display-lg": ["2.5rem", { lineHeight: "1.08", letterSpacing: "-0.025em" }],
        "display-md": ["1.75rem", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
      },
      boxShadow: {
        card: "0 1px 0 rgba(32,33,36,0.04), 0 1px 3px rgba(32,33,36,0.06)",
        lift: "0 2px 4px rgba(32,33,36,0.04), 0 12px 32px -8px rgba(32,33,36,0.14)",
        inset: "inset 0 0 0 1px rgba(32,33,36,0.08)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      backgroundImage: {
        grain:
          "radial-gradient(rgba(32,33,36,0.07) 1px, transparent 1px)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
    },
  },
  plugins: [],
};
