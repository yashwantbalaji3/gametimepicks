# Deployment Guide

This guide covers everything needed to take GametimePicks from a local checkout
to a live deployment at `gametimepicks.yashwantbalaji.com`.

## A. Vercel deployment

### Prerequisites

- The repo is pushed to GitHub (private or public is fine for v1)
- You have a Vercel account
- *(optional)* you have an Odds API key for live data

### Steps

1. **Push to GitHub** (see exact commands at the bottom of this file).

2. **Import the project in Vercel.**
   - Go to https://vercel.com/new
   - Click "Import Git Repository"
   - Select your `gametimepicks` repo

3. **Configure the project.**
   - **Framework preset:** Next.js *(auto-detected)*
   - **Root directory:** `app` *(this is critical — the Next.js app lives in `app/`, not the repo root)*
   - **Build command:** `npm run build` *(default)*
   - **Output directory:** *leave default* — Next.js with `output: "export"` writes to `out/` and Vercel handles it
   - **Install command:** `npm install` *(default)*

4. **Add environment variables.** All optional — the site builds without them.
   In the Vercel dashboard, under Project → Settings → Environment Variables,
   add any of these you want for the build environment:

   | Variable | Recommended for v1 |
   |---|---|
   | `NBA_DATA_MODE` | `demo` *(start in demo for safety)* |
   | `ODDS_DATA_MODE` | `demo` |
   | `ODDS_API_KEY` | *(blank for demo, paste your key when ready for live)* |
   | `TIMEZONE` | `America/New_York` |

   You can leave all of these unset and the site will still build — the
   pipeline runs locally on your machine, not in Vercel's build, so build-
   time secrets aren't strictly required. The frontend just reads the JSON
   files committed to the repo.

5. **Deploy.** Click "Deploy." First build takes ~2 minutes. The site goes
   live at a `*.vercel.app` URL.

6. **Verify.** Click through all six routes — Home, Model Board, Player
   Trends, Results, Methodology, Responsible Use. Confirm the persistent
   disclaimer banner is visible above the nav.

## B. Subdomain setup — `gametimepicks.yashwantbalaji.com`

You're adding `gametimepicks.yashwantbalaji.com` as a subdomain CNAME pointing
at the Vercel project. This keeps the GametimePicks deployment separate from
your main portfolio site.

### Steps

1. **In Vercel:**
   - Project → Settings → Domains
   - Click "Add Domain"
   - Type `gametimepicks.yashwantbalaji.com` and click Add
   - Vercel will display DNS instructions specific to your domain

2. **In your DNS provider** (Cloudflare, Namecheap, GoDaddy, Route 53,
   wherever `yashwantbalaji.com` is registered):

   Add a single record:

   ```
   Type:   CNAME
   Name:   gametimepicks
   Value:  cname.vercel-dns.com           ← Vercel will tell you the exact target
   TTL:    3600 (or default)
   ```

   *Note: this guide does not assume your DNS provider. The exact UI varies.
   Vercel's "Add Domain" screen gives you the precise target value to use.*

3. **Wait for DNS propagation.** Usually 5–15 minutes; can take up to a few
   hours depending on your TTL. Vercel will show a green checkmark next to
   the domain when DNS is verified.

4. **HTTPS.** Vercel provisions a Let's Encrypt certificate automatically
   once DNS is verified. No action required.

5. **Verify.** Visit https://gametimepicks.yashwantbalaji.com — you should
   see the same site that's running at the `*.vercel.app` URL, now over HTTPS
   on your custom domain.

## C. Data refresh workflow (v1, manual)

For v1 the pipeline runs on your local machine and the JSON files are
committed to git. Vercel rebuilds when you push.

```bash
# 1. Run the pipeline (uses live providers if .env has ODDS_API_KEY,
#    otherwise demo)
bash scripts/run_pipeline.sh

# 2. Commit the updated JSON
git add app/public/data/*.json
git commit -m "data refresh $(date +%F)"

# 3. Push — Vercel automatically rebuilds and redeploys
git push
```

Cycle time from `run_pipeline.sh` to live ~3 minutes (pipeline + push +
Vercel rebuild).

If you want to refresh without code changes, this is fine — the JSON is
considered data, and committing it cleanly is part of the v1 workflow.

## D. Future automation

When manual refresh gets old, the natural next step is a daily GitHub Actions
workflow that:

1. Checks out the repo
2. Sets up Python + installs `pipeline/requirements.txt`
3. Runs `bash scripts/run_pipeline.sh` with `ODDS_API_KEY` from GitHub Secrets
4. Commits any changed JSON in `app/public/data/`
5. Pushes back to `main`
6. Vercel redeploys

Skeleton (not implemented yet — see `Future work` in the README):

```yaml
# .github/workflows/daily-refresh.yml  (TODO)
name: daily-refresh
on:
  schedule:
    - cron: "0 16 * * *"  # 12 PM ET daily
  workflow_dispatch:
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { token: ${{ secrets.GH_PAT }} }
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r pipeline/requirements.txt
      - run: bash scripts/run_pipeline.sh
        env:
          ODDS_API_KEY: ${{ secrets.ODDS_API_KEY }}
      - run: |
          git config user.name "gtp-bot"
          git config user.email "bot@yashwantbalaji.com"
          git add app/public/data/*.json
          git diff --cached --quiet || git commit -m "data refresh $(date +%F)"
          git push
```

Don't add this until the v1 manual workflow has been proven for a couple of
weeks.

## Exact GitHub commands

After the repo is on disk and you're ready to publish:

```bash
cd ~/projects/gametimepicks   # or wherever you cloned/unzipped

# First-time init (only if not already a git repo)
git init -b main
git add .
git commit -m "GametimePicks v1 — pipeline + frontend + provider system"

# Create a NEW empty repo at github.com/<your-username>/gametimepicks
# (use the GitHub web UI; do NOT initialize with README, .gitignore, or LICENSE)

# Wire up the remote and push
git remote add origin https://github.com/<your-username>/gametimepicks.git
git push -u origin main
```

If you prefer the GitHub CLI:

```bash
gh repo create gametimepicks --public --source=. --remote=origin --push
```

Don't run any of these until you've reviewed the contents (`git status`,
`git diff --cached --stat`) and confirmed `.env` is not staged.
