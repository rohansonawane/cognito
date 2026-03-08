# GitHub Profile Portfolio — Setup Guide

## 🚀 How to Deploy Your Profile

### Step 1: Create Your Profile Repository

1. Go to GitHub and create a new repository named **exactly** `rohansonawane` (your username)
2. Make it **public**
3. Initialize with a README

### Step 2: Add the Profile README

Copy `README.md` from this folder to the root of your `rohansonawane/rohansonawane` repo.

### Step 3: Set Up the Snake Game Animation

1. In your profile repo, create: `.github/workflows/snake.yml`
2. Copy the contents of `snake-workflow.yml` into that file
3. Go to **Actions** tab → Enable workflows
4. Run the workflow manually once: **Actions → Generate Snake Animation → Run workflow**
5. Wait ~30 seconds, then an `output` branch will be created with the SVGs

### Step 4: Customize Links

Update these in `README.md`:
- `rohansonawane` → your actual GitHub username (already set!)
- Social links (LinkedIn, Twitter)
- Email address
- Project links

### Step 5: Enable GitHub Stats

The stats cards use public APIs — they work automatically for public repos.
For private repo stats, no extra setup needed (the URLs include `count_private=true`).

---

## 🎮 Games — Quick Setup

### ♟️ Chess Game (Optional)
The chess game links to GitHub Issues. Players submit moves via issues.
You can automate responses using GitHub Actions + Stockfish:
- Repo: [timburgan/timburgan](https://github.com/timburgan/timburgan) — great reference implementation

### 🐍 Snake Game Page (Optional)
To host your own Snake game on GitHub Pages:
1. Create repo: `rohansonawane/snake-game`
2. Add a simple HTML Snake game
3. Enable GitHub Pages → served at `rohansonawane.github.io/snake-game`

---

## 📊 Cards Used

| Card | Source |
|------|--------|
| GitHub Stats | `github-readme-stats.vercel.app` |
| Streak Stats | `github-readme-streak-stats.herokuapp.com` |
| Activity Graph | `github-readme-activity-graph.vercel.app` |
| Trophies | `github-profile-trophy.vercel.app` |
| Typing SVG | `readme-typing-svg.demolab.com` |
| Capsule Render | `capsule-render.vercel.app` |
| Snake | Your profile repo's `output` branch |

All are **free** and **open source** — no API keys needed!

---

## 🎨 Customization Tips

- **Theme**: Change `tokyonight` to `radical`, `gruvbox`, `cobalt`, `dracula`, `merko`
- **Colors**: Update `00D9FF` hex to your brand color
- **Font**: Change `Fira+Code` in typing SVG to `JetBrains+Mono`, `Roboto+Mono`, etc.
- **Header**: Customize text in `capsule-render.vercel.app` URL parameters
