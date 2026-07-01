# parninja.com

Static landing page for [parninja.com](https://parninja.com) — app store links for ParNinja and future ParNinja LLC apps.

Hosted on **GitHub Pages** (separate from the [parninja](https://github.com/emmett/parninja) app repo).

## Pages

- `/` — landing page with app store links
- `/privacy` — privacy policy and contact form
- `/data` — data access, correction, and deletion requests

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
