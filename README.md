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
3. Invite each owner by email under **Collaborators**. They don't need a GitHub account: they sign in with the emailed link and see a section for each page plus Site settings.

## Forms (one-time setup)

The Apply to join form is emailed to the owners by [Web3Forms](https://web3forms.com) (free, up to 250 a month, no account needed).
1. On web3forms.com, enter the email address that should receive them and copy the **Access Key** it emails you.
2. Pages CMS → **Site settings** → paste it into **Form key** → Save.
The key is meant to be public, so it's fine in this repository. Until it's added, the forms tell visitors they can't send yet.
The questions can be changed in Pages CMS (Apply page → Questions). START is one of the membership choices on that form: its days and times questions use **Show only when** (START), so they only appear when START is picked. The old START page address (start.html) now sends visitors to the Apply page with START already picked.

## Timetable

The Train page can show the class timetable in two ways (Pages CMS → Train page → Timetable style):
- **Our design**: the site reads WodBoard's class list each time it publishes and shows it in the site's own style. The publish workflow runs every hour, so changes in WodBoard appear within the hour. If WodBoard can't be reached, the page shows WodBoard's embed instead.
- **WodBoard's design**: WodBoard's own embedded timetable, always live.

In our design, each class's Book link goes to that class in WodBoard (`https://www.wodboard.com/events/{id}`, set in Train page → Book link for each class). Members sign in to WodBoard and book. Clear that field to send every Book link to the general Book button link instead.

GitHub pauses hourly workflows in a repository with no activity for 60 days. Any save in Pages CMS counts as activity. If it does pause, Actions → Publish site → Enable workflow.

## Launching

Before launch the site shows a "Preview" banner and asks search engines not to list it. When it's ready: Pages CMS → **Site settings** → tick **Site is launched** → Save.

Moving from new.hybridhubnqy.co.uk to the main address, in this order:
1. **Wix DNS** (the domain is registered and managed at Wix): point the bare domain's A records at GitHub Pages (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153) and change `www` to a CNAME for `perranporthafcmens.github.io`. Leave the MX/TXT records alone.
2. **GitHub** → Settings → Pages → Custom domain: `www.hybridhubnqy.co.uk` (the bare domain then redirects to it, and new.hybridhubnqy.co.uk stops serving the site).
3. **Pages CMS** → Site settings → tick **Site is launched**. The Web address there is already `https://www.hybridhubnqy.co.uk`.
4. When GitHub has issued the certificate (up to an hour), tick **Enforce HTTPS** in Settings → Pages.
5. Check the site, send one real Apply form, then submit `https://www.hybridhubnqy.co.uk/sitemap.xml` in Google Search Console.
6. Cancel the Wix **site plan** only. The domain is a separate Wix subscription and must keep renewing, or the address stops working.

Old Wix page addresses (for example /applytojointhehub or /hyperice) send visitors to the matching new page. The list is `OLD_WIX_PAGES` in build.js.
