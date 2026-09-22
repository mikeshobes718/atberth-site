# atberth.com

Marketing site for Berth. Plain HTML, CSS, and a little JS. No framework.

- `npm run build` copies `src/` to `dist/`, minifies, and fails on dashes, IP addresses, OCIDs, or token-like strings.
- `npm run images` renders the Open Graph image and icons with headless Chrome.
- `npm run preview` builds and serves on http://localhost:4321.

Pushing to `main` deploys to GitHub Pages at https://atberth.com.
