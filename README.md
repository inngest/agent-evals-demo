# Agent Evals Booth Demo

This demo follows `PRD.md`: a Next.js App Router app with a real Inngest v4 workflow and mocked LLM, query, and scoring surfaces.

## Design System Source

The reusable design layer is sourced from `~/inngest/swag-store`, not `~/inngest/swag-store-demo`:

- `components.json`
- `src/components/ui/`
- `src/app/brand.css`
- Next/Tailwind/PostCSS/ESLint/TypeScript config shape

The app-specific layout mirrors the simplified Insights surface described in the PRD.

## Local Development

Run the Next app and the local Inngest dev server in separate terminals:

```bash
npm run dev
npm run inngest:dev
```

`npm run dev` defaults to `INNGEST_DEV=1`, so the app talks to the local dev
server without needing Cloud keys.

## Production Inngest

The app is wired for Inngest Cloud the same way the swag-store apps are:

- `INNGEST_EVENT_KEY` sends events from API routes.
- `INNGEST_SIGNING_KEY` authenticates the `/api/inngest` serve endpoint.
- `INNGEST_ENCRYPTION_KEY` is optional. When present, the app enables
  `@inngest/middleware-encryption` for encrypted Inngest payload storage.
- `INNGEST_ENV` is optional for targeting a non-default Cloud environment.
- `NEXT_PUBLIC_INNGEST_DASHBOARD_URL` controls the "View trace" link base.

For Vercel production, set these environment variables on the project and leave
`INNGEST_DEV` unset:

```txt
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
INNGEST_ENCRYPTION_KEY=
NEXT_PUBLIC_INNGEST_DASHBOARD_URL=https://app.inngest.com
```

After deploy, sync/register the Inngest app in Cloud with:

```txt
https://<vercel-domain>/api/inngest
```

To smoke-test Cloud auth from localhost, export the same Cloud keys locally and
run:

```bash
npm run dev:cloud
```
