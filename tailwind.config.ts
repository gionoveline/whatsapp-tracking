import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-outfit)", "system-ui", "sans-serif"],
        sans: ["var(--font-source-sans)", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in-up": "fade-in-up 0.5s ease-out both",
        "stagger-1": "fade-in-up 0.5s ease-out 0.1s both",
        "stagger-2": "fade-in-up 0.5s ease-out 0.2s both",
        "stagger-3": "fade-in-up 0.5s ease-out 0.3s both",
        "stagger-4": "fade-in-up 0.5s ease-out 0.4s both",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      colors: {
        accent: "var(--accent)",
        "accent-foreground": "var(--accent-foreground)",
      },
    },
  },
  plugins: [],
} satisfies Config;
