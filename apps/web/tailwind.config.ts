import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        frame: {
          bg: "var(--frame-bg)",
          panel: "var(--frame-panel)",
          "panel-elevated": "var(--frame-panel-elevated)",
          border: "var(--frame-border)",
          "border-subtle": "var(--frame-border-subtle)",
          text: "var(--frame-text)",
          muted: "var(--frame-muted)",
          accent: "var(--frame-accent)",
          "accent-hover": "var(--frame-accent-hover)",
          success: "var(--frame-success)",
          warning: "var(--frame-warning)",
          danger: "var(--frame-danger)"
        }
      },
      boxShadow: {
        frame: "0 8px 32px rgba(0, 0, 0, 0.45)"
      }
    }
  },
  plugins: []
};

export default config;
