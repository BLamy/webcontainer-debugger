/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./index.html",
    "./src/index.css",
    "./src/WebContainerDebugger.tsx",
    "./src/main.tsx"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} 