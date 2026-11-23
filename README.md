# Devon ZIP Loader

A **pure Node.js** application for preparing the `dlcasto2/db-v2` source archive for a custom, server-backed Devon preview deployment.

This is not a `devon://apps` application. It no longer uses Next.js, React, TypeScript, or Turbopack. The loader itself runs on Node's built-in HTTP server and serves a static HTML/CSS/vanilla-JavaScript interface. JSZip is the only runtime dependency and is served from `node_modules` to the browser.

## Requirements

- Node.js 20 or newer (Node.js 22 LTS recommended)
- npm

## Install and run

```bash
npm install
npm run check
npm start
```

Open http://localhost:3000.

For automatic restart while editing:

```bash
npm run dev
```

`npm install` creates the local `node_modules/` directory. It is intentionally excluded from Git because installed packages are reproducible from `package.json` and platform-specific native modules should not be committed.

## Prepare a Devon preview package

1. Download the source ZIP from [dlcasto2/db-v2](https://github.com/dlcasto2/db-v2/archive/refs/heads/main.zip).
2. Drop it into the loader or choose it from your device.
3. Review the project checks.
4. Choose the deployment URL path (`/preview` by default, or `/` for the domain root).
5. Download the generated `devon-preview-deployment.zip`.
6. Extract it on a host with Docker Engine and Docker Compose.
7. Copy `.env.preview.example` to `.env` and add required credentials.
8. Run:

```bash
docker compose -f docker-compose.preview.yml up -d --build
```

For a `/preview` deployment, configure the reverse proxy to preserve the complete `/preview` prefix when forwarding requests to port 3000. Do not strip the prefix.

## Archive handling

ZIP inspection and repackaging happen in the browser; source files are not uploaded to this Node server. The loader enforces a 220 MB archive limit, a 22,000-file limit, and an estimated 900 MB expanded-size limit. It rejects unsafe paths and excludes common generated folders, environment files, private keys, and local credential files.

## Endpoints

- `GET /` — loader interface
- `GET /app.js` — browser-side ZIP workflow
- `GET /styles.css` — stylesheet
- `GET /vendor/jszip.min.js` — JSZip browser bundle from `node_modules`
- `GET /health` — JSON health response

## Project structure

```
server.js
public/
  index.html
  app.js
  styles.css
package.json
```

The generated Devon deployment remains a Next.js application; only the ZIP Loader tool itself has been converted to pure Node.js.
