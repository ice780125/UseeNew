# see — implementation path

## Stack

- **Frontend**: Vite 6, React 18, TypeScript (`src/`)
- **Backend**: Node ESM, Express (`server/index.js`) — local API proxy so the AIHubMix key never ships to the browser
- **Dev**: `npm run dev` runs Express on `127.0.0.1:3847` and Vite on `5173`; Vite proxies `/api` → `3847` (`vite.config.ts`)

## Data flow

1. Browser `POST /api/generate` with JSON: `{ prompt: string, imageDataUrls?: string[] }` (1–2 `data:image/...;base64,...` URLs when references are used).
2. Express reads `AIHUBMIX_API_KEY` from `.env`, normalizes the key, builds OpenAI-style `POST {BASE}/chat/completions` with model `web-gpt-image-2` (or `AIHUBMIX_MODEL`).
3. With images, `user.content` is built in `server/index.js`: labeled multimodal parts (图1/图2 mapping) + system prompt that forbids “please upload” when refs exist.
4. Response `choices[0].message.content` is stringified/flattened and returned as `{ content, raw }`.
5. UI parses image URLs from markdown/HTTP/data-URI in `content` and shows the first image only (`firstImageOnly`).

## Environment (`.env`)

| Variable | Role |
|----------|------|
| `AIHUBMIX_API_KEY` | Bearer token (ASCII `sk-...` line) |
| `AIHUBMIX_BASE_URL` | Default `https://aihubmix.com/v1` |
| `AIHUBMIX_MODEL` | Default `web-gpt-image-2` |
| `SEE_API_PORT` | API port, default `3847` |
| `AIHUBMIX_IMAGE_DETAIL` | Optional `high` / `off` for `image_url.detail` |

## Key files

| Path | Purpose |
|------|---------|
| `server/index.js` | Auth, multimodal body, upstream `fetch`, response flatten |
| `src/App.tsx` | Two reference slots, generate, gallery, lightbox |
| `src/styles.css` | UI theme |
| `vite.config.ts` | `/api` proxy |

## Production note

Serve the Vite `dist/` behind any static host and run the Express server (or equivalent) with the same `/api` routes and environment variables — never expose `AIHUBMIX_API_KEY` in client bundles.
