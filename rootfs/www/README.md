# KDF Hadex Web Assets

This folder contains the web frontend for the KDF Home Assistant add-on.

Dev

- Install dependencies: `npm install` (or `pnpm`) in `rootfs/www`
- Start dev server: `npm run dev` (uses `dev-index.html` for local dev).

Build

- Build bundles: `npm run build`
- Output is written to `rootfs/www/dist` and should be copied/deployed as static assets in the add-on's `rootfs/www` served path.

CI / GitHub Actions

- A GitHub Actions workflow is included at `.github/workflows/ci.yml` which runs type checking and builds the `rootfs/www` bundle on push and pull requests.
- The workflow will cache `node_modules` and upload the `dist` artifacts for use in release pipelines if needed.

Local CI

- Run a local CI check: `npm run ci` (runs `tsc --noEmit` then `vite build`).

Notes

- The build outputs `panel.js` and `cards.js` in `dist/` (ES module format); the existing static HTML pages will try to load `dist/cards.js` first and fall back to legacy scripts for compatibility.
- If you need Tabulator type definitions, consider adding a `tabulator-tables` package or create a minimal `src/types/tabulator.d.ts` file.

Vendor and styles

- Third-party JS/CSS (Tabulator) lives under `rootfs/www/vendor/tabulator/` and is copied into the `dist/` output by Vite. The runtime code imports the loader at `/local/kdf-hadex/vendor/tabulator/tabulator-loader.js`.
- The canonical stylesheet is `rootfs/www/kdf-styles.css`. During build we generate a Lit-style JS module at `src/styles/kdf-styles.js` from the CSS using `npm run gen-styles` (this is run automatically as part of `npm run build`).
