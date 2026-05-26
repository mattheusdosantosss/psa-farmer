import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        psa: {
          orange: "#F26522",
          "orange-dark": "#D84F0F",
          "orange-light": "#FF8A4A",
          blue: "#1B3A6B",
          "blue-dark": "#122847",
          "blue-light": "#2C5490",
          cream: "#FAF7F2",
          gray: "#6B7280",
        },
      },
    },
  },
  plugins: [],
};

export default config;