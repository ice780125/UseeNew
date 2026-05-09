# Deploy Usee for friends

Architecture: one Node process serves **static UI** (`dist/`) and **`/api/*`** (your AIHubMix key stays on the server).

## 1. Environment variables (hosting dashboard)

| Variable | Required | Example |
|----------|----------|---------|
| `AIHUBMIX_API_KEY` | Yes | `sk-...` |
| `NODE_ENV` | Yes for static UI | `production` |
| `PORT` | Usually auto | Railway/Render set this |
| `AIHUBMIX_BASE_URL` | Optional | `https://aihubmix.com/v1` |
| `AIHUBMIX_MODEL` | Optional | `web-gpt-image-2` |

Never commit `.env`. Never expose the key in the frontend bundle.

## 2. Build & start

```bash
npm ci
npm run build
npm start
```

`npm start` runs `NODE_ENV=production node server/index.js`, which listens on **`0.0.0.0:$PORT`** and serves `dist/` + API.

## 3. Platform hints

**Railway / Render / Fly.io**  
- Build command: `npm ci && npm run build`  
- Start command: `npm start`  
- Set env vars in the dashboard.

**Docker** (outline)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

Pass `AIHUBMIX_API_KEY` at run time (`-e` or orchestrator secrets).

## 4. Security & usage for friends

- Your API key = **your billing / quota** — anyone with the site URL can consume it. Consider **HTTP Basic**, **allowlisted IPs**, or **login** before exposing widely.
- Add **rate limiting** on `/api/generate` if abuse is a concern.
- Use **HTTPS** only (hosts above provide TLS).

## 5. Local production smoke test

```bash
npm run build
NODE_ENV=production PORT=8080 AIHUBMIX_API_KEY=sk_xxx npm start
```

Open `http://localhost:8080` — generate once to confirm.
