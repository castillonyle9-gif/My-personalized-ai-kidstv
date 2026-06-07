# 🎬 Kids TV Shorts Agent

AI-powered YouTube Shorts automation. Add a topic from the website → GitHub Actions generates the script, metadata, and uploads to YouTube — even when you're offline.

## How it works

```
You type topic on website
        ↓
queue.json updated in GitHub repo (via GitHub API)
        ↓
GitHub Actions runs (06:00 / 11:00 / 15:00 UTC)
        ↓
Gemini AI (Slot A) → Script
Gemini AI (Slot B) → Voiceover narration
Gemini AI (Slot C) → Title, tags, hashtags, video prompt
        ↓
Video prompt → copy to Luma/Kling/Haiper (Gen 1/2/3)
        ↓
YouTube Data API → auto-upload with full metadata
```

## Setup (one time)

### 1. Fork this repo
Click Fork on GitHub. Name it `kidstv-agent`.

### 2. Enable GitHub Pages
Settings → Pages → Branch: main → Save.
Your dashboard: `https://YOUR_USERNAME.github.io/kidstv-agent`

### 3. Get your API keys

**Gemini (3 free accounts):**
- aistudio.google.com → Get API Key (one per Google account)
- Free tier: 60 requests/min, resets daily

**YouTube:**
- console.cloud.google.com → New project → Enable YouTube Data API v3
- Credentials → OAuth 2.0 Client ID (Desktop) → Download JSON
- Run: `node scripts/get_token.js` to get your refresh token

### 4. Add GitHub Secrets
Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|-------|
| GEMINI_KEY_A | Your first Gemini API key |
| GEMINI_KEY_B | Your second Gemini API key |
| GEMINI_KEY_C | Your third Gemini API key |
| VID_KEY_1 | Luma/Kling/Haiper API key account 1 |
| VID_SVC_1 | luma / kling / haiper / runway |
| VID_KEY_2 | Video gen account 2 key |
| VID_SVC_2 | Service name |
| VID_KEY_3 | Video gen account 3 key |
| VID_SVC_3 | Service name |
| YT_CLIENT_ID | From Google Cloud Console |
| YT_CLIENT_SECRET | From Google Cloud Console |
| YT_REFRESH_TOKEN | From get_token.js script |

### 5. Add your GitHub PAT to the website
On the website (your GitHub Pages URL):
- Setup tab → paste your GitHub Personal Access Token (Settings → Developer settings → PAT → repo + workflow scopes)
- Enter your repo as `username/kidstv-agent`

This allows the "Trigger Now" button to fire the action instantly.

## File structure

```
kidstv-agent/
├── index.html                    ← Your dashboard website
├── queue.json                    ← Video queue (auto-updated)
├── output_log.json               ← Generation history
├── package.json
├── scripts/
│   ├── agent.js                  ← Main AI agent (runs in GitHub Actions)
│   └── get_token.js              ← One-time YouTube token setup
└── .github/
    └── workflows/
        └── agent.yml             ← GitHub Actions schedule
```

## Free tier limits

| Service | Free credits | Reset |
|---------|-------------|-------|
| Gemini 1.5 Flash | 60 req/min, 1500 req/day | Daily |
| GitHub Actions | 2,000 min/month | Monthly |
| Luma Dream Machine | ~30 generations | Daily |
| Kling AI | ~10 generations | Daily |
| Haiper | ~15 generations | Daily |

3 videos/day × 30 days = 90 videos/month — well within all free limits.

## Notes

- Videos are flagged "Made for Kids" (COPPA) automatically
- The agent retries failed items on the next run
- Last 50 generation logs saved to output_log.json
- Video binary upload: paste the video prompt into your video generator, download the video, then upload manually OR connect a video gen API that returns a download URL
