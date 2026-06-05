# Usee

AI poster / image tool (React + Vite + Express). Proxies [AIHubMix](https://aihubmix.com) so API keys stay on the server.

## Features

- Text-to-image with optional reference frames (chain edits)
- Platform size presets (Douyin, Xiaohongshu, Taobao, LinkedIn, …)
- Login: 30 accounts (`Onekey001` … `Onekey030`), 3 free generations each, 30-day membership
- Save all generated image links to a file

## Local development

```bash
cp .env.example .env
# Edit .env — set AIHUBMIX_API_KEY=sk-...

npm install
npm run accounts:regen   # creates ACCOUNTS.local.md (password list, gitignored)
npm run dev
```

Open http://localhost:5173

## Environment

| Variable | Description |
|----------|-------------|
| `AIHUBMIX_API_KEY` | Required — from AIHubMix console |
| `AIHUBMIX_BASE_URL` | Optional, default `https://aihubmix.com/v1` |
| `AIHUBMIX_MODEL` | Optional, default `web-gpt-image-2` |
| `SEE_FREE_QUOTA` | Free images per account (default `3`) |
| `SEE_MEMBERSHIP_DAYS` | Membership length in days (default `30`) |

## Do not commit

- `.env` — API keys
- `ACCOUNTS.local.md` — plaintext passwords
- `server/usage.json` — per-user usage / membership start times
- `node_modules/` — thousands of files; run `npm install` after clone

## Upload to GitHub

**Recommended:** `git push` (only ~26 files are tracked — no need to merge code).

If you must use the website “Upload files” (100-file limit), do **not** drag the whole folder. Run:

```bash
bash scripts/pack-for-github.sh
```

Then upload only `Usee-github-upload.zip` or the `Usee-github-upload/` folder (~26 files).

## Production

See [DEPLOY.md](./DEPLOY.md).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite + API (5173 + 3847) |
| `npm run build` | Build frontend to `dist/` |
| `npm start` | Production server (serves `dist/` + API) |
| `npm run accounts:regen` | Regenerate `server/accounts.json` + `ACCOUNTS.local.md` |
