# parninja.com

Static landing page for [parninja.com](https://parninja.com) — app store links for ParNinja and future ParNinja LLC apps.

Hosted on **GitHub Pages** (separate from the [parninja](https://github.com/emmett/parninja) app repo).

## Pages

- `/` — landing page with app store links
- `/privacy` — privacy policy and contact form
- `/data` — data access, correction, and deletion requests
- `/support` — support contact form
- `/watch` — shared round replay (TF 192 screen-player: scorecard + stylized map tracers). Noindexed via meta robots and `robots.txt`.

## Watch page — payload handoff (testing today)

The viewer loads a **round JSON document** and scans hole-by-hole / stroke-by-stroke. There is no share API yet; handoff is file-based.

### Schema (v1)

```json
{
  "v": 1,
  "meta": {
    "course": "Course name",
    "tees": "Blue",
    "datePlayed": "2026-09-12",
    "playerDisplayName": "optional"
  },
  "holes": [
    {
      "holeNumber": 1,
      "par": 4,
      "score": 4,
      "distance": 392,
      "strokes": [
        {
          "club": "DR",
          "lie": "Tee",
          "distanceRemaining": 392,
          "SGA": 0.12,
          "position": { "latitude": 35.12895, "longitude": -80.8412 }
        },
        {
          "club": "PU",
          "lie": "Green",
          "distanceRemaining": 0,
          "SGA": 0.08,
          "strokeCount": 1,
          "firstPuttDistance": 3.67,
          "position": { "latitude": 35.13195, "longitude": -80.8402 }
        }
      ]
    }
  ]
}
```

**Stroke fields that matter for the map**

| Field | Required | Notes |
|-------|----------|--------|
| `position.latitude` / `longitude` | Yes (for GPS holes) | Pins + tracer |
| `club` | Yes | Pill label (`DR` → `Dr`) |
| `lie` | Recommended | Pill color (`Tee`, `Fairway`, `Rough`, `Sand`, `Green`, `Recovery`) |
| `SGA` | Optional | Shown in shot meta |
| `distanceRemaining` | Optional | HUD context |
| `strokeCount` / `firstPuttDistance` | Putts | `firstPuttDistance` is **yards**; label shows feet (`1p 11'`) |

Shot yardage on non-putt pills is computed GPS-to-GPS (this stroke → next), not from `distanceRemaining`. Include all 18 holes for a full scorecard; holes without GPS strokes still show score shapes but no map path.

Reference fixture: [`watch/fixtures/sample-round.json`](watch/fixtures/sample-round.json).

### How to test your own payload

1. Drop a JSON file in `watch/fixtures/` (e.g. `my-round.json`).
2. Open `/watch/?fixture=my-round` (filename without `.json`).
3. Default with no query: loads `sample-round`.

Local:

```bash
python3 -m http.server 8080
# http://localhost:8080/watch/
# http://localhost:8080/watch/?fixture=my-round
```

Production (after deploy): `https://parninja.com/watch/` and `https://parninja.com/watch/?fixture=my-round`.

### Live share decode

`#r=` blobs are decoded client-side by `watch/js/shareCodec.js` (gzip or raw DEFLATE → JSON / compact → boot).

The player matches the in-app **TF 192 screen-player contract** via shared **`@parninja/replay`** (engine + controller + tokens), with chrome/transport/yards/pins aligned to `RoundReplayPlayer`. Source of truth: `parninja/packages/replay`. `/watch` loads a generated IIFE (`watch/js/replayEngine.js`) — rebuild with `scripts/build-replay-engine.sh` or from the app: `npm run build:watch-replay`. Encode stays parked.

**Intentional diffs vs native:** MapLibre flat greens (no Apple/Google muted basemap detail); web CTA link instead of in-app share sheet; no modal close chrome.

**Canonical app format = v2 pack** (below). Verbose fixtures remain for local/`?fixture=` testing only.

Still not built: hosted short ids (`/watch/abc12`), in-app Share sheet.

### Convert raw JSON → share formats (comparison)

```bash
# Compare all encodings for one hole
python3 scripts/round-to-share.py watch/fixtures/watch-warm-springs-2026-09-11.json --hole 3

# Full round
python3 scripts/round-to-share.py path/to/round.json

# Emit a pasteable #r= URL (compact text + raw DEFLATE)
python3 scripts/round-to-share.py path/to/round.json --format compact --encode

# Write raw + .b64 artifacts
python3 scripts/round-to-share.py path/to/round.json --write /tmp/share-out
```

Formats: `slim-json`, `arrays`, `pipe`, `binary`, `binary-nometas`, `compact`, `compact-bin`.  
**App should emit v2 pack JSON** (not these experiment formats). Reference fixture: `watch/fixtures/watch-warm-springs-2026-09-11.v2.json`.

## Watch share — compression & URL handoff (app brief)

Aligned with Notion *[Replay share & web viewer](https://app.notion.com/p/3dcc75393b8581a5bfeac82a13af28d0)*. **Never put GPS in the query string.**

### Encode pipeline (ship this)

```
v2 pack JSON (no spaces)
  → gzip level 9
  → base64url (RFC 4648 §5, strip =)
  → https://parninja.com/watch/#r=<blob>
```

If `blob.length > 1500` → hosted short id later (`/watch/abc12`). Soft cap ~1500 for iMessage.

```js
// App encode
const json = JSON.stringify(v2Pack); // no spaces
const gz = gzipSync(utf8Encode(json), { level: 9 });
const blob = base64Url(gz); // +/ → -_, strip =
const url = `https://parninja.com/watch/#r=${blob}`;

// Web already decodes: gunzip → JSON.parse → expand → boot()
```

### Why hash, not query

| Place | Behavior |
|-------|----------|
| Query `?data=` | Sent to servers, logged, truncated |
| Hash `#r=` | Client-only; copied with the link |

### v2 pack schema (canonical)

```json
{
  "v": 2,
  "m": ["Warm Springs", "W", "20260911"],
  "C": ["7W", "GW", "SW", "PU", "DR", "8I", "9I", "PW", "5I", "LW", "7I"],
  "L": ["T", "F", "R", "S", "G", "X"],
  "h": [
    [4, [4359241, -11616565], [4358991, -11616398], [
      [0],
      [1, 2, -188, 148],
      [2, 2, -16, 20],
      [3, 4, 2, 26]
    ]]
  ]
}
```

| Field | Meaning |
|-------|---------|
| `m` | `[course, teeShort, YYYYMMDD]` — tee short e.g. `W`→Whites |
| `C` / `L` | Club dictionary + lie dictionary (`T F R S G X`) |
| Hole row | `[par, teeµ, greenµ, strokes]` — hole number = index + 1 |
| µdeg | `round(lat/lng × 1e5)` (~1 m) |
| First `[c]` | Club at **tee**. `[c, p]` if penalty (e.g. OB re-tee) |
| First `[c, l]` / `[c, l, p]` | Non-tee start (rare) |
| Later `[c, l, dlat, dlng]` | Δ from **previous** stroke (+ optional trailing `p`) |
| Green putt `[c, G, n, ft]` | Position = **green**. `n` = putt count, `ft` = first-putt **feet** |
| Score | **Do not store.** Unpack: each non-putt = 1, green putt = `n`, plus penalties |

**Omit:** `distanceRemaining`, `SGA` (unless non-zero later), hole yards, stored score, bag, user id, other rounds.

Viewer expands to internal schema (`club`, `lie`, `position`, `strokeCount`, `firstPuttDistance` yards = `ft/3`, `penalty`) then `boot()`.

### Proven size (Warm Springs full 18)

| Payload | Size | `#r=` | Fits ≤1500? |
|---------|------|-------|-------------|
| v2 pack JSON | 1796 B | — | — |
| gzip-9 | 696 B | **928** | Yes |
| Verbose fixture JSON gzip | — | ~2040 | No |

Full-18 round shares fit in the URL with v2 pack. Prefer hole-scoped shares for privacy when possible.

### App share flow

1. User taps **Share round** / **Share hole** (Premium).
2. Build v2 pack → gzip → base64url.
3. If `blob.length ≤ 1500`: copy `https://parninja.com/watch/#r=…`.
4. Else: POST → hosted id (not built yet).
5. Native share sheet.

Hash links are irrevocable without changing the data; treat GPS as sensitive.

### Viewer load order (live)

1. `#r=` → decode (gzip / raw DEFLATE / plain) → boot
2. `?fixture=` → local JSON (dev)
3. Else empty / error

Reference decode: `watch/js/shareCodec.js` (`parseV2Pack`). Reference pack: `watch/fixtures/watch-warm-springs-2026-09-11.v2.json`.

## Contact form

The privacy page uses [FormSubmit](https://formsubmit.co) to deliver messages to `privacy@parninja.com`. On first use, FormSubmit sends a confirmation email to that address — click the link to activate.

Edit policy text in `privacy/policy-body.html`, then rebuild:

```bash
python3 scripts/build-privacy.py
```

## Local preview

```bash
cd parninja-website
python3 -m http.server 8080
# open http://localhost:8080
```

## Updating store links

Edit `config.js` and set `iosUrl` / `androidUrl` for each app. Use `null` to show “coming soon”.

```js
apps: [
  {
    name: 'ParNinja',
    iosUrl: 'https://apps.apple.com/app/id1234567890',
    androidUrl: 'https://play.google.com/store/apps/details?id=com.aclless.ParNinja',
    // ...
  },
],
```

Add more entries to `apps` when you ship additional applications.

## GitHub Pages setup

1. Create a new GitHub repo (e.g. `parninja-website` or `parninja.com`).
2. Push this directory to `main`.
3. **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: `main` / `/ (root)`
4. **Custom domain**: enter `parninja.com` (the `CNAME` file in this repo sets it automatically).
5. Enable **Enforce HTTPS** once DNS has propagated.

## DNS (parninja.com)

At your domain registrar, either:

**Option A — Apex + www (recommended)**

| Type  | Name | Value                |
|-------|------|----------------------|
| A     | @    | `185.199.108.153`    |
| A     | @    | `185.199.109.153`    |
| A     | @    | `185.199.110.153`    |
| A     | @    | `185.199.111.153`    |
| CNAME | www  | `<user>.github.io`   |

**Option B — Subdomain only**

| Type  | Name | Value              |
|-------|------|--------------------|
| CNAME | @    | `<user>.github.io` |

Replace `<user>` with your GitHub username or org (e.g. `emmett`).

GitHub’s [custom domain docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site) have the latest IP list.

## Create the remote repo

```bash
cd parninja-website
git init
git add .
git commit -m "Add ParNinja landing page for GitHub Pages"
git branch -M main
git remote add origin git@github.com:emmett/parninja-website.git
git push -u origin main
```

Then configure Pages and DNS as above.
