# Devon ZIP Loader

A standalone Next.js 16 App Router application using Turbopack for development and production builds. It prepares the `dlcasto2/db-v2` source archive for a custom, server-backed Devon preview deployment.

This is **not** a `devon://apps` application and does not replace or extend Devon's browser-extension importer.

## Run the loader

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Prepare a Devon preview package

1. Download the source archive from [dlcasto2/db-v2](https://github.com/dlcasto2/db-v2/archive/refs/heads/main.zip).
2. Drop the ZIP into the loader or choose it from your device.
3. Review the project checks. The loader looks for a Next.js package manifest, an App Router page, Devon's `app/api/proxy` route, and the pnpm lockfile.
4. Set **Deployment URL Path** in the loader (`/preview` by default; use `/` for the domain root). The loader patches Devon's `next.config.mjs` with the selected Next.js `basePath`.\n5. Download the generated `devon-preview-deployment.zip`.
6. Extract that ZIP on a host with Docker Engine and Docker Compose.
7. Copy `.env.preview.example` to `.env`, then add only the credentials required by the services enabled in your Devon deployment. Keep `DEPLOYMENT_URL_PATH` set to the selected path.
8. Run:

```bash
docker compose -f docker-compose.preview.yml up -d --build
```

Route the preview hostname over HTTPS to the service on port 3000.

The generated package includes a multi-stage Node.js 22 Dockerfile, a Compose service with a health check, a Docker ignore file, an environment template, and deployment instructions. The chosen `DEPLOYMENT_URL_PATH` is passed as a Docker build argument and applied to Devon's Next.js `basePath` before `next build` (Next.js embeds this setting at build time). Devon's `postinstall` step copies vendor assets, so the Docker build copies the source tree before installing dependencies.

## Archive handling

ZIP files are inspected and repackaged in the browser; this loader does not upload the source ZIP to a server. It enforces a 220 MB upload limit, a 22,000-file entry limit, and an estimated 900 MB expanded-size limit. It rejects unsafe archive paths and excludes common build/dependency folders, environment files, private keys, and local credential files from the deployment archive.

## Hosting requirements

Devon is not a static site. Its proxy and API routes execute on the server, so static export and static-only hosting (including GitHub Pages) are not suitable for a full Devon deployment. Use a persistent Node/Docker host or a provider that supports the required server runtime.

The loader prepares deployment files; it does not create the preview environment, provision DNS/TLS, set up Redis, or create API credentials. Depending on which Devon features are enabled, you may need Redis, model-provider credentials, Auth0 configuration, and the platform-specific settings documented in the source repository's README.

## Build

```bash
npm run build
npm run start
```

GitHub Actions builds the application on pushes to `main` and publishes a 14-day source ZIP artifact when the workflow can complete its archive step.
