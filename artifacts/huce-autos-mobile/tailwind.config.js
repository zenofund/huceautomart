/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./App.tsx", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "hsl(0 0% 97%)",
        foreground: "hsl(210 25% 12%)",
        card: "hsl(0 0% 100%)",
        "card-foreground": "hsl(210 25% 12%)",
        "card-border": "hsl(140 15% 88%)",
        popover: "hsl(0 0% 100%)",
        "popover-foreground": "hsl(210 25% 12%)",
        "popover-border": "hsl(140 15% 88%)",
        primary: "hsl(143 60% 26%)",
        "primary-foreground": "hsl(0 0% 100%)",
        secondary: "hsl(43 87% 46%)",
        "secondary-foreground": "hsl(30 50% 10%)",
        muted: "hsl(130 15% 95%)",
        "muted-foreground": "hsl(140 10% 45%)",
        accent: "hsl(130 15% 93%)",
        "accent-foreground": "hsl(143 60% 22%)",
        destructive: "hsl(0 84% 60%)",
        "destructive-foreground": "hsl(0 0% 100%)",
        border: "hsl(140 12% 88%)",
        input: "hsl(140 12% 88%)",
        ring: "hsl(143 60% 26%)",
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "10px",
        xl: "14px",
        full: "9999px",
      },
    },
  },
  plugins: [],
};
