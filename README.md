# Devon ZIP Loader

A **pure Node.js** custom preview ZIP loader for `dlcasto2/db-v2`. It can run locally as a small Node HTTP server or publish as a static site on GitHub Pages using GitHub Actions.

The interface is HTML, CSS, and vanilla JavaScript. ZIP inspection and repackaging happen entirely in the visitor's browser. JSZip is the only runtime dependency. The Pages build copies JSZip's browser bundle into the static output, so GitHub Pages does not need to run Node.js.

This is not a `devon://apps` application.

## Run locally

Requires Node.js 20+ (Node.js 22 recommended).

```bash
npm install
npm run check
npm start
```

Open http://localhost:3000. For automatic restart while editing, run `npm run dev`.

## Deploy to GitHub Pages

1. In the repository, open **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Push to `main` (or manually run the **Build and deploy to GitHub Pages** workflow).
4. GitHub Actions installs JSZip, creates the static `_site/` folder, uploads it as a Pages artifact, and deploys it.

The project-site URL will be:

`https://dlcasto2.github.io/devon-zip-loader/`

The page uses relative asset links, so it works under the repository subpath as well as a custom domain. The browser downloads the source ZIP from `dlcasto2/db-v2` and creates the deployment ZIP locally.

## Static build locally

```bash
npm install
npm run build:pages
```

The generated static website is in `_site/`. Preview it with any static file server.

## Prepare a Devon preview package

1. Download the source ZIP from [dlcasto2/db-v2](https://github.com/dlcasto2/db-v2/archive/refs/heads/main.zip).
2. Drop it into the loader or choose it from your device.
3. Review the compatibility checks.
4. Choose the deployment URL path (`/preview` by default or `/` for the domain root).
5. Download `devon-preview-deployment.zip`.
6. Extract it on a host with Docker Engine and Docker Compose.
7. Copy `.env.preview.example` to `.env` and add the required credentials.
8. Run:

```bash
docker compose -f docker-compose.preview.yml up -d --build
```

For a `/preview` deployment, configure the reverse proxy to preserve the full `/preview` prefix when forwarding requests to port 3000.

## Archive handling

ZIP files are processed in the browser; their contents are not uploaded to this server or GitHub Pages. The loader enforces a 220 MB compressed archive limit, a 22,000-file limit, and an estimated 900 MB expanded-size limit. It rejects unsafe paths and excludes common generated folders, environment files, private keys, and local credential files.

## Local Node server endpoints

- `GET /` — loader interface
- `GET /app.js` — browser ZIP workflow
- `GET /styles.css` — styles
- `GET /vendor/jszip.min.js` — JSZip browser bundle served from `node_modules`
- `GET /health` — local server health response

GitHub Pages serves the static files directly and does not run `server.js`. The Devon project being packaged remains a Next.js application; only this ZIP Loader is static/pure Node.js.
