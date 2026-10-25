/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          850: '#151f32',
          950: '#0b1120'
        },
        teal: {
          550: '#0ea5a0',
          650: '#0a8884'
        }
      }
    },
  },
  plugins: [],
}
