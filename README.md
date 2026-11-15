# PraetorLink Game Guides

Free, unofficial strategy guide companions by PraetorLink Games. Think of a classic printed strategy guide, but interactive, spoiler-aware and kept up to date. The first guide is **Dragon's Dogma 2** (including the Dark Arisen DLC, tagged "DLC").

> Unofficial fan project. Not made, endorsed or sponsored by Capcom. Dragon's Dogma is a trademark of Capcom Co., Ltd. No game art, music, logos or wiki text is included. Guide text is written by PraetorLink from facts gathered by players (sources are credited in the app).

## What it does

- **Now**: the next step, quests that are about to close, quests that suit your level, reminders, and a resume button.
- **Quests, Choices, Items, World, Level up, Secrets, Fix it**: the guide itself, with spoilers hidden until you tap.
- **Checklist**: achievements, Seeker's Tokens and other trackers. On PC it can read your Steam achievements straight from Steam's files on your computer.
- **Party helper, Shopping list, Ask the guide (works offline), read-aloud, compact always-on-top window, phone sync by QR code, several playthroughs.**
- **Accessibility**: text size, high contrast, reduce motion, colour-blind-safe tags with symbols, keyboard and controller navigation.
- **Privacy**: no account, no ads, no tracking. Progress stays on your device. The app only goes online to check for updates.

## How updates work

| What changed | What happens | Who it reaches |
|---|---|---|
| Guide data (`content/`) | A merge to `main` rebuilds the data and publishes it with the web app on GitHub Pages | Every installed app picks it up on its next check (on launch and every 6 hours). No store review is needed. |
| App code + `VERSION` bumped | A merge to `main` builds the Windows installer and publishes a GitHub release with `latest.json` | Installed PC apps update themselves. Phones: run the **Mobile** workflow (phase 2). |

## Working on it

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # checks the guide data and the logic
npm run build          # builds the guide data and the web app into dist/
npm run tauri dev      # desktop app (needs Rust)
```

The guide data lives in `content/<game>/` as JSON (`quests.json`, `items.json`, and so on). Edit those files directly. `npm run check:content` tells you about broken links, missing spoiler levels or DLC tags. `scripts/research/` holds the one-time importers that turned the original research notes (kept outside this repo) into the JSON.

**Tester mode:** on the Settings screen, tap the version line 7 times. Every quest, item, place and tip then gets "Looks right" and "Something's wrong" buttons. Export the notes from Settings and they become a content fix.

## One-time setup (repo owner)

1. **Pages:** Settings, Pages, Source = **GitHub Actions**.
2. **PC auto-update key:** Settings, Secrets and variables, Actions, new secret `TAURI_SIGNING_PRIVATE_KEY`, holding the private key that matches the public key in `src-tauri/tauri.conf.json`. Without it, installers still build but can't update themselves.
3. **Custom domain (optional):** add a CNAME record `gameguides` pointing to `rlink84.github.io` in Cloudflare (DNS only), then set Settings → Pages → Custom domain to `gameguides.praetorlink.com` (done 2026-11-15).
4. **Phones (phase 2):** see the secrets listed at the top of `.github/workflows/mobile.yml`.
5. **Pawn board (optional):** deploy `worker/` to Cloudflare (steps at the top of `worker/wrangler.toml`), then add a repository variable `PAWN_API` with the worker's URL. Until then the Pawn board screen shows "coming soon" and community links.
