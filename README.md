# AURA website

The public marketing + download site. Plain HTML, CSS and one small JavaScript
file — no build step, no framework, no dependencies to install. Open
`index.html` in a browser and it works.

```
site/
├── index.html          landing page
├── download.html       install guide — the page that has to work for everyone
├── mcp.html            developer / MCP setup
├── privacy.html        privacy policy + terms (mirrors LegalCopy.kt)
├── robots.txt
├── sitemap.xml
├── .nojekyll           stops GitHub Pages running Jekyll over the folder
└── assets/
    ├── css/aura.css        design tokens, base, layout   ← ported from Mono.kt
    ├── css/components.css  hero, Set-of-Marks phone, feature grid, safety
    ├── css/pages.css       steps, accordions, tables, code blocks, prose
    ├── js/aura.js          theme, reveal, copy buttons, live release lookup
    └── media/
        ├── favicon.svg
        ├── og.png              1200×630 social card
        └── _og-source.html     source for og.png — see "Regenerating" below
```

---

## Publishing

The source repo is private, and GitHub Pages on a private repo is a paid
feature — so the site has to be published from a public repo.

This folder lives inside the private repo, so don't `git init` inside it — a
nested repo fights the outer one. Use `git subtree`, which pushes just this
subfolder to another repo's root and keeps a single source of truth.

**One-time setup.** Create an empty public repo named `aura` on GitHub (no
README, no license — it must be empty), then from the **repo root**:

```bash
git remote add site https://github.com/Dinesh210805/aura.git
git subtree push --prefix site site main
```

Then in the `aura` repo: **Settings → Pages → Source: `Deploy from a branch`
→ Branch: `main` / `(root)` → Save.**

Live in a minute or two at **https://dinesh210805.github.io/aura/**

**Publishing an update.** Commit to this repo as normal, then push the subtree
again:

```bash
git add site && git commit -m "site: <what changed>"
git subtree push --prefix site site main
```

If `subtree push` is ever rejected because the public repo has commits yours
doesn't (you edited a file on github.com, say), the fix is a force replace —
the public repo holds no history worth keeping:

```bash
git push site $(git subtree split --prefix site main):main --force
```

### Why every link is relative

Nothing in these pages hardcodes a domain. That means the identical folder
works at `dinesh210805.github.io/aura/`, at a bare domain, on Vercel, or opened
straight off disk — with no edits. If you later add a custom domain, drop a
`CNAME` file containing just the hostname into this folder; nothing else
changes.

---

## The site updates itself when you ship a release

`assets/js/aura.js` fetches the latest release from the public
`Dinesh210805/aura-releases` repo on page load and rewrites:

| Marker | Becomes |
|---|---|
| `data-rel="version"` | tag name, minus the `v` |
| `data-rel="size"` | APK size in MB |
| `data-rel="date"` | publish date |
| `data-rel="filename"` | the `.apk` asset's filename |
| `data-rel-href` | the asset's download URL |

So **publishing a new APK updates this site with no HTML edit.** The values
written into the HTML are the current release, so the page is still correct
with JavaScript off, offline, or if GitHub rate-limits the request — the fetch
only ever upgrades what's already there, and silently does nothing on failure.

The one value that does *not* auto-update is the **SHA-256** on
`download.html` (`id="sha"`), because the API doesn't publish it. Update that
by hand each release, or delete the block.

---

## Adding videos

Every visual on the site is drawn in CSS/SVG, so it is complete as-is. Video
slots are additive: drop the file in and it takes over automatically. A missing
file degrades to a labelled caption, never a broken frame.

| File | Where | Ratio | Length | What it should show |
|---|---|---|---|---|
| `hero.mp4` | `index.html` hero, inside the phone | **9:19 portrait** | 10–14 s | One task end to end: "Hey AURA, message Amma I'm running 10 minutes late" → it opens the app, types, sends. Silent, loops cleanly. |
| `install.mp4` | `download.html`, after the steps | **16:9** | 45–90 s | Screen recording of the five install steps, especially **Allow restricted settings**. |

Both must be **muted and loopable** — they autoplay, and browsers block
autoplay with sound. Keep each under ~6 MB; encode H.264 MP4.

If you want more slots, copy the `.slot` block from `download.html`.

### Videos worth recording later

These are the ones that would sell the app hardest, in order:

1. **The banking refusal.** Ask AURA to open a banking app and let it refuse out
   loud. This is the single most persuasive thing you own — nobody else can
   show it, and it turns "scary" into "trustworthy" in eight seconds.
2. **Typing in Rapido or Swiggy.** The React Native problem is invisible to
   users until they see automation fail in those apps. Show it working.
3. **A deep link vs the tap chain**, side by side — one call against four taps.
4. **MCP: Claude Code driving the phone**, split screen, laptop and handset.

---

## Regenerating the social card

`assets/media/og.png` was rendered from `assets/media/_og-source.html` at
exactly 1200×630. To redo it after a copy or brand change, edit that file and
screenshot it at that viewport — any headless-browser screenshot tool works.
The source file is never linked from the site, so it costs nothing to keep.

---

## Design notes

The look is ported from the app rather than invented, so the two never drift:

- **Colours** come from `aura-android/.../ui/theme/Mono.kt` — canvas `#FAFAF8`,
  ink `#0A0A0A`, blood `#A31621`, plus the dark scheme.
- **Typefaces** are the app's: Schibsted Grotesk for display, Instrument Sans
  for body. JetBrains Mono is added for anything the machine says.
- **Red is never decorative.** It appears in exactly three places, all meaning
  "look here now": the chosen element in the hero animation, the download
  button, and the restricted-settings warning. If you add a fourth, check it
  earns the same meaning.
- **Numbered markers are `som_id`s**, the app's real addressing scheme — not
  decorative step numbers.

---

## Accuracy rules

These claims were checked against the code and must not drift:

| Claim | Status |
|---|---|
| **47 tools** | Counted from `mcp-server/.../tools/`. The README's "36" is stale. |
| **Same Wi-Fi only** | TURN is not configured; cross-network ICE fails. Never write "from anywhere". |
| **Perception is on-device** | True. But the BYOK model still receives what it needs to decide — never claim "nothing leaves your phone". |
| **Not open source** | The source repo is private. The site says "free", never "open source". |
| Permission copy | Lifted verbatim from `PermissionRegistry.kt`. |
| Per-brand steps | Lifted verbatim from `OemCompat.overlayFixSteps`. |

If any of these change in the app, change them here in the same commit.
