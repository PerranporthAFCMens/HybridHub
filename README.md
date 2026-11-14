# HybridHub

The Hybrid Hub Newquay website: four pages (Home, Train, Memberships, Visit).

- **Owners edit the site in [Pages CMS](https://app.pagescms.org).** There's no database. Each save is a commit to this repository, and the site republishes itself in about a minute.
- The words, prices, links and photos live in `content/*.json` and `images/`. The page layouts are in `src/`.
- `node build.js` turns them into the finished site in `_site/` (Node 18 or later, no installs needed).

## Hosting (one-time setup)

**GitHub Pages (free, needs the repository to be public):**
1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Run **Actions → Publish site → Run workflow** once, or push any change. The address appears in Settings → Pages.
3. Custom domain (later): add it in Settings → Pages → Custom domain, then follow GitHub's DNS steps.

**Cloudflare Pages (free, works with a private repository):** Workers & Pages → Create → Pages → Connect to Git → pick this repo. Build command `node build.js`, output folder `_site`. Then turn off the GitHub Pages workflow (Actions → Publish site → Disable workflow).

## Letting the owners edit

1. Go to https://app.pagescms.org and sign in with GitHub.
2. Install the Pages CMS GitHub app when it asks, and give it access to **HybridHub** only. Then open the repository.
3. Invite each owner by email under **Collaborators**. They don't need a GitHub account: they sign in with the emailed link and see the five sections (Home, Train, Memberships, Visit, Site settings).

## Launching

Before launch the site shows a "Preview" banner and asks search engines not to list it. When it's ready: Pages CMS → **Site settings** → tick **Site is launched** → Save.
