import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#121416",
        foreground: "#ECEFF1",
        surface: "#1A1D21",
        elevated: "#23272D",
        card: "#1A1D21",
        border: "#31363D",
        muted: "#7D8790",
        accent: "#7A8F6B",
        olive: "#7A8F6B",
        brass: "#B08D57",
        risk: "#A35D5D",
        success: "#6E8B74",
        electric: "#7A8F6B",
        alert: "#A35D5D"
      }
    }
  },
  plugins: []
};

export default config;
