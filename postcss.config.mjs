/**
 * RegLayer — PostCSS Configuration
 *
 * WHY: Tailwind CSS 4 uses PostCSS as its processing pipeline.
 * WHAT: Registers @tailwindcss/postcss plugin (replaces old tailwindcss + autoprefixer combo).
 * HOW: PostCSS processes globals.css → extracts utility classes → generates final CSS bundle.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
