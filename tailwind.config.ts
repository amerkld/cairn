import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "hsl(var(--bg-base) / <alpha-value>)",
          surface: "hsl(var(--bg-surface) / <alpha-value>)",
          elevated: "hsl(var(--bg-elevated) / <alpha-value>)",
          overlay: "hsl(var(--bg-overlay) / <alpha-value>)",
        },
        fg: {
          primary: "hsl(var(--fg-primary) / <alpha-value>)",
          secondary: "hsl(var(--fg-secondary) / <alpha-value>)",
          muted: "hsl(var(--fg-muted) / <alpha-value>)",
          onAccent: "hsl(var(--fg-on-accent) / <alpha-value>)",
        },
        border: {
          subtle: "hsl(var(--border-subtle) / <alpha-value>)",
          strong: "hsl(var(--border-strong) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          muted: "hsl(var(--accent-muted) / <alpha-value>)",
        },
        danger: "hsl(var(--danger) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
        xl: "14px",
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgb(0 0 0 / 0.2)",
        elevated:
          "0 4px 12px -2px rgb(0 0 0 / 0.35), 0 2px 4px -1px rgb(0 0 0 / 0.2)",
        focus: "0 0 0 2px hsl(var(--accent) / 0.35)",
      },
      transitionTimingFunction: {
        swift: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      transitionDuration: {
        fast: "120ms",
        DEFAULT: "160ms",
        slow: "240ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
