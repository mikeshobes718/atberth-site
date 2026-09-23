# atberth.com

Marketing site and console for Berth. Plain HTML, CSS, and JS modules. No framework.

- `src/app/` is the console at https://atberth.com/app/: email code sign in, then everything the CLI does (apps, tables, SQL, auth users, storage, functions, env vars, webhooks, keys, logs, settings, account, admin). It talks only to `api.atberth.com/v1` with a 7 day session key.

- `npm run build` copies `src/` to `dist/`, minifies, and fails on dashes, IP addresses, OCIDs, or token-like strings.
- `npm run images` renders the Open Graph image and icons with headless Chrome.
- `npm run preview` builds and serves on http://localhost:4321.

Pushing to `main` deploys to GitHub Pages at https://atberth.com.
