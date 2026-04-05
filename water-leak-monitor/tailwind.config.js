/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ocean: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          500: "#0ea5e9",
          700: "#0369a1",
          900: "#0c4a6e",
        },
        alert: {
          DEFAULT: "#dc2626",
          soft: "#fef2f2",
        },
        /** App shell — deep blue-zinc */
        shell: {
          DEFAULT: "#030712",
          card: "#0f172a",
          elevated: "#111c2e",
        },
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 32px -8px rgba(0,0,0,0.45)",
      },
    },
  },
  plugins: [],
};
