import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    extend: {
      boxShadow: {
        'ios-sm': '0 1px 3px rgba(0, 0, 0, 0.1)',
        'ios-md': '0 4px 12px rgba(0, 0, 0, 0.15)',
        'ios-lg': '0 10px 25px rgba(0, 0, 0, 0.2)',
        'ios-xl': '0 20px 40px rgba(0, 0, 0, 0.25)',
        'ios-dark-sm': '0 1px 3px rgba(0, 0, 0, 0.3)',
        'ios-dark-md': '0 4px 12px rgba(0, 0, 0, 0.4)',
        'ios-dark-lg': '0 10px 25px rgba(0, 0, 0, 0.5)',
        'ios-dark-xl': '0 20px 40px rgba(0, 0, 0, 0.6)',
      },
      backdropBlur: {
        'ios': '20px',
      },
      borderRadius: {
        'ios': '12px',
        'ios-lg': '16px',
        'ios-xl': '20px',
        'ios-2xl': '24px',
      },
      animation: {
        'ios-bounce': 'ios-bounce 0.2s ease-in-out',
      },
      keyframes: {
        'ios-bounce': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;