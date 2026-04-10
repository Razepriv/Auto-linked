import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "var(--brand-primary)",
          "primary-hover": "var(--brand-primary-hover)",
          "primary-light": "var(--brand-primary-light)",
          secondary: "var(--brand-secondary)",
          "secondary-hover": "var(--brand-secondary-hover)",
          "secondary-light": "var(--brand-secondary-light)",
          accent: "var(--brand-accent)",
          "accent-hover": "var(--brand-accent-hover)",
          "accent-light": "var(--brand-accent-light)",
        },
        semantic: {
          success: "var(--color-success)",
          "success-light": "var(--color-success-light)",
          "success-border": "var(--color-success-border)",
          warning: "var(--color-warning)",
          "warning-light": "var(--color-warning-light)",
          "warning-border": "var(--color-warning-border)",
          error: "var(--color-error)",
          "error-light": "var(--color-error-light)",
          "error-border": "var(--color-error-border)",
          info: "var(--color-info)",
          "info-light": "var(--color-info-light)",
          "info-border": "var(--color-info-border)",
        },
        pillar: {
          blue: "var(--pillar-blue)",
          purple: "var(--pillar-purple)",
          pink: "var(--pillar-pink)",
          amber: "var(--pillar-amber)",
          emerald: "var(--pillar-emerald)",
        },
        surface: {
          DEFAULT: "var(--surface)",
          raised: "var(--surface-raised)",
          overlay: "var(--surface-overlay)",
          sunken: "var(--surface-sunken)",
          sidebar: "var(--surface-sidebar)",
          elevated: "var(--surface-elevated)",
        },
        border: {
          DEFAULT: "var(--border)",
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
          focus: "var(--border-focus)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          inverse: "var(--text-inverse)",
          link: "var(--text-link)",
          "link-hover": "var(--text-link-hover)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
        "4xl": "2rem",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-out": {
          from: { opacity: "1", transform: "translateY(0)" },
          to: { opacity: "0", transform: "translateY(8px)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-out-right": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(100%)" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "slide-down": {
          from: { transform: "translateY(0)" },
          to: { transform: "translateY(100%)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "scale-out": {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.95)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "overlay-show": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "overlay-hide": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "fade-out": "fade-out 0.2s ease-in",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "slide-out-right": "slide-out-right 0.2s ease-in",
        "slide-up": "slide-up 0.3s ease-out",
        "slide-down": "slide-down 0.2s ease-in",
        "scale-in": "scale-in 0.2s ease-out",
        "scale-out": "scale-out 0.15s ease-in",
        shimmer: "shimmer 2s ease-in-out infinite",
        "overlay-show": "overlay-show 0.2s ease-out",
        "overlay-hide": "overlay-hide 0.15s ease-in",
        "spin-slow": "spin-slow 1s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
