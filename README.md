# parninja.com

Static landing page for [parninja.com](https://parninja.com) — app store links for ParNinja and future ParNinja LLC apps.

Hosted on **GitHub Pages** (separate from the [parninja](https://github.com/emmett/parninja) app repo).

## Pages

- `/` — landing page with app store links
- `/privacy` — privacy policy and contact form
- `/data` — data access, correction, and deletion requests
- `/support` — support contact form
- `/watch` — shared hole scanner (scorecard + map tracers). Noindexed via meta robots and `robots.txt`.

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

### Not built yet (app → web share)

- `#r=` gzip+base64url hole blob in the URL hash
- Hosted short ids (`/watch/abc12`)
- In-app Share sheet uploading this JSON

Until those exist, testing means committing a fixture under `watch/fixtures/` or serving one locally.

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
