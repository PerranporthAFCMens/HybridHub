#!/usr/bin/env node
/* Builds the Hybrid Hub website into _site/.
   Pages are HTML templates in src/, filled from the JSON files in content/ (which owners edit in Pages CMS).
   No dependencies: needs Node 18 or later. Run: node build.js

   Template tags (a small subset of Mustache):
     {{name}}               text, made safe for HTML (line breaks become <br>)
     {{#name}}…{{/name}}    repeat for each item of a list, or show if true
     {{^name}}…{{/name}}    show if empty or false
     {{.}}                  the current list item (for lists of plain text)
     {{> header}}           include src/partials/header.html */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_site');
const PAGES = ['index', 'train', 'memberships', 'visit', 'apply', 'dropin', 'recovery', 'privacy'];
// Pages from the old Wix site (from its sitemap) and where they now live. The 404 page has the same list as a fallback.
const OLD_WIX_PAGES = {
  'applytojointhehub': 'apply.html',
  'registerforstart': 'apply.html?plan=START',
  'hyperice': 'recovery.html',
  'book-online': 'train.html',
  'pricing-plans/list': 'memberships.html',
  'service-page/functional-fitness': 'train.html',
  'service-page/premium-open-gym': 'memberships.html',
  'service-page/strength-conditioning': 'train.html',
  'xmasparty': '',
  'blank': '', 'blank-1': '', 'blank-2': '', 'blank-3': '', 'copy-of-founders5': '',
};
const siteBaseFor = (data) => String(data.site.site_url || '').replace(/\/+$/, '');
const FIELD_TYPES = ['text', 'email', 'tel', 'date', 'radio', 'checkboxes', 'select', 'textarea', 'note'];

function readJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'content', name + '.json'), 'utf8'));
}

// Pages CMS writes uploaded images as "/images/…". Make them relative so the site works at any address
// (a custom domain, a Cloudflare address, or a GitHub Pages project address such as /HybridHub/).
function relativeAssets(v) {
  if (Array.isArray(v)) return v.map(relativeAssets);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = relativeAssets(v[k]);
    return o;
  }
  if (typeof v === 'string' && /^\/images\//.test(v)) return v.slice(1);
  return v;
}

function escapeHTML(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/\r?\n/g, '<br>');
}

function lookup(stack, name) {
  if (name === '.') return stack[stack.length - 1];
  const parts = name.split('.');
  for (let i = stack.length - 1; i >= 0; i--) {
    let v = stack[i];
    if (v && typeof v === 'object' && parts[0] in v) {
      for (const p of parts) v = v == null ? undefined : v[p];
      return v;
    }
  }
  return undefined;
}

function isEmpty(v) {
  return v == null || v === false || v === '' || (Array.isArray(v) && v.length === 0);
}

const TAG_SOURCE = /\{\{\s*([#^\/>]?)\s*([\w.]+)\s*\}\}/.source;

function render(tpl, stack, file) {
  let out = '';
  let pos = 0;
  const TAG = new RegExp(TAG_SOURCE, 'g');
  let m;
  while ((m = TAG.exec(tpl))) {
    out += tpl.slice(pos, m.index);
    const [whole, kind, name] = m;
    pos = m.index + whole.length;
    if (kind === '') {
      const v = lookup(stack, name);
      if (v === undefined) console.warn(`Warning: ${file}: nothing filled in for "${name}"`);
      out += escapeHTML(v);
    } else if (kind === '>') {
      const partial = fs.readFileSync(path.join(ROOT, 'src', 'partials', name + '.html'), 'utf8');
      out += render(partial, stack, name + '.html');
    } else if (kind === '#' || kind === '^') {
      // find the matching close tag, allowing nested sections of the same name
      let depth = 1;
      const inner = new RegExp(`\\{\\{\\s*([#^/])\\s*${name.replace(/\./g, '\\.')}\\s*\\}\\}`, 'g');
      inner.lastIndex = pos;
      let c;
      while ((c = inner.exec(tpl))) {
        if (c[1] === '/') { if (--depth === 0) break; } else depth++;
      }
      if (!c) throw new Error(`${file}: "{{${kind}${name}}}" is never closed`);
      const body = tpl.slice(pos, c.index);
      pos = c.index + c[0].length;
      TAG.lastIndex = pos;
      const v = lookup(stack, name);
      if (kind === '^') {
        if (isEmpty(v)) out += render(body, stack, file);
      } else if (Array.isArray(v)) {
        v.forEach((item, i) => {
          const ctx = item && typeof item === 'object' ? Object.assign({ index: i + 1, odd: i % 2 === 0 }, item) : item;
          out += render(body, stack.concat([ctx]), file);
        });
      } else if (!isEmpty(v)) {
        out += render(body, typeof v === 'object' ? stack.concat([v]) : stack, file);
      }
    } else if (kind === '/') {
      throw new Error(`${file}: unexpected "{{/${name}}}"`);
    }
  }
  return out + tpl.slice(pos);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

// Form questions are edited in Pages CMS as a label, a type and (for choices) options.
// Give each one a field name from its label and a flag for its type, for the template.
function prepareFields(fields, file) {
  const used = {};
  return (fields || []).map((f, i) => {
    const type = FIELD_TYPES.includes(f.type) ? f.type : 'text';
    let name = String(f.label || 'question').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'question';
    if (used[name]) name += '_' + (i + 1);
    used[name] = true;
    if ((type === 'radio' || type === 'checkboxes' || type === 'select') && !(f.options || []).length) console.warn(`Warning: ${file}: "${f.label}" has no choices`);
    // "Show only when": the question appears only once one of these choices is picked earlier in the form.
    const showWhen = (Array.isArray(f.show_when) ? f.show_when : [f.show_when]).map((v) => String(v || '').trim()).filter(Boolean);
    return Object.assign({ required: false, options: [] }, f, { type, name, id: 'f-' + name, ['is_' + type]: true, show_when_attr: showWhen.join('|') });
  });
}

// Timetable in the site's own design: read the class list behind WodBoard's embed when the site is built.
// The publish workflow rebuilds every hour, so it stays current. If WodBoard can't be reached, the page
// falls back to WodBoard's own embedded timetable.
const TZ = 'Europe/London';
function londonParts(date) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return o;
}
async function loadTimetable(train) {
  if (train.timetable_style !== 'own' || !train.timetable_data_url) return null;
  const now = new Date();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const p = londonParts(d);
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // YYYY-MM-DD
    days.push({ key, weekday: i === 0 ? 'Today' : p.weekday, daynum: p.day, full: `${i === 0 ? 'Today, ' : ''}${p.weekday} ${p.day} ${p.month}`, classes: [] });
  }
  // WodBoard returns at most 7 days at a time.
  const end = new Date(new Date(days[0].key + 'T00:00:00Z').getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const url = `${train.timetable_data_url}${train.timetable_data_url.includes('?') ? '&' : '?'}start=${days[0].key}&end=${end}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const events = await res.json();
    if (!Array.isArray(events)) throw new Error('unexpected data');
    for (const e of events) {
      const start = new Date(e.start), finish = new Date(e.end);
      if (isNaN(start) || finish < now) continue;
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(start);
      const day = days.find((d) => d.key === key);
      if (!day) continue;
      const s = londonParts(start), f = londonParts(finish);
      // Link each class straight to that session in WodBoard (members sign in, then book). If the class
      // has no id, or no class link is set, fall back to the general booking link.
      const bookUrl = train.timetable_class_url && e.id != null
        ? train.timetable_class_url.replace('{id}', encodeURIComponent(e.id))
        : train.timetable_book_url;
      day.classes.push({ sort: start.getTime(), start: `${s.hour}:${s.minute}`, end: `${f.hour}:${f.minute}`, title: String(e.title || 'Class').trim(), book_url: bookUrl });
    }
    for (const d of days) d.classes.sort((a, b) => a.sort - b.sort);
    console.log(`Timetable: ${events.length} classes read from WodBoard`);
    return days;
  } catch (err) {
    console.warn(`Warning: couldn't read the WodBoard timetable (${err.message}); showing WodBoard's embed instead`);
    return null;
  }
}

// Instagram: latest posts from a Behold JSON feed (behold.so, free plan). Read at build time,
// so the feed only gets ~1 request an hour however many people visit the site.
function ago(date, now) {
  const mins = Math.max(0, (now - date) / 60000);
  if (mins < 60) return Math.max(1, Math.round(mins)) + 'm';
  if (mins < 1440) return Math.round(mins / 60) + 'h';
  if (mins < 10080) return Math.round(mins / 1440) + 'd';
  if (mins < 525600) return Math.round(mins / 10080) + 'w';
  return Math.round(mins / 525600) + 'y';
}
async function loadInstagram(site) {
  const url = String(site.instagram_feed_url || '').trim();
  if (!url) return [];
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const feed = await res.json();
    const posts = Array.isArray(feed) ? feed : feed.posts;
    if (!Array.isArray(posts)) throw new Error('unexpected data');
    const now = Date.now();
    const out = posts.map((p) => {
      const sizes = p.sizes || {};
      const img = (sizes.medium || sizes.large || sizes.small || {}).mediaUrl || p.thumbnailUrl || (p.mediaType !== 'VIDEO' && p.mediaUrl);
      if (!img || !/^https:\/\//.test(img) || !/^https:\/\/(www\.)?instagram\.com\//.test(p.permalink || '')) return null;
      const caption = String(p.prunedCaption || p.caption || '').replace(/\s+/g, ' ').trim();
      const when = new Date(p.timestamp);
      return {
        image: img, link: p.permalink,
        alt: caption ? caption.slice(0, 120) : 'Instagram post from Hybrid Hub',
        ago: isNaN(when) ? '' : ago(when, now),
        is_video: p.mediaType === 'VIDEO',
        is_album: p.mediaType === 'CAROUSEL_ALBUM',
      };
    }).filter(Boolean).slice(0, 6);
    console.log(`Instagram: ${out.length} posts read from the feed`);
    return out;
  } catch (err) {
    console.warn(`Warning: couldn't read the Instagram feed (${err.message}); hiding the Instagram section`);
    return [];
  }
}

// Business details for Google (schema.org), so search and Maps can tie the site to the Google Business Profile.
// Built from Site settings and the Visit page; added to the home and Visit pages.
function businessSchema(data, base) {
  const site = data.site;
  const details = (data.visit && data.visit.details) || [];
  const find = (re) => (details.find((d) => re.test(d.label || '')) || {}).value || '';
  const address = String(find(/address/i)).split(/,|\n/).map((x) => x.trim()).filter(Boolean);
  const hours = String(find(/hours/i));
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ExerciseGym',
    name: site.title,
    description: site.description,
    url: base + '/',
    image: base + '/' + String(data.home.hero.image || '').replace(/^\//, ''),
    address: Object.assign({ '@type': 'PostalAddress', addressCountry: 'GB' },
      address[0] ? { streetAddress: address[0] } : {},
      address[1] ? { addressLocality: address[1] } : {},
      address[2] ? { addressRegion: address[2] } : {},
      site.postcode ? { postalCode: site.postcode } : {}),
    sameAs: [site.instagram && `https://www.instagram.com/${site.instagram}/`, site.google_profile_url].filter(Boolean),
  };
  if (site.google_profile_url) schema.hasMap = site.google_profile_url;
  if (/24\s*hours/i.test(hours)) {
    schema.openingHoursSpecification = [{ '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '00:00', closes: '23:59' }];
  }
  return '<script type="application/ld+json">' + JSON.stringify(schema).replace(/</g, '\\u003c') + '</script>';
}

async function build() {
  const data = relativeAssets({
    site: readJSON('site'),
    home: readJSON('home'),
    train: readJSON('train'),
    memberships: readJSON('memberships'),
    visit: readJSON('visit'),
    apply: readJSON('apply'),
    dropin: readJSON('dropin'),
    recovery: readJSON('recovery'),
    privacy: readJSON('privacy'),
  });
  data.train.timetable_days = await loadTimetable(data.train);
  data.train.use_own_timetable = !!data.train.timetable_days;
  data.train.use_embed = !data.train.timetable_days;
  data.home.instagram_posts = await loadInstagram(data.site);
  data.apply.fields = prepareFields(data.apply.fields, 'apply.json');
  data.dropin.fields = prepareFields(data.dropin.fields, 'dropin.json');

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const page of PAGES) {
    const file = page + '.html';
    const tpl = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
    const base = String(data.site.site_url || '').replace(/\/+$/, '');
    const ctx = Object.assign({}, data, {
      page, ['is_' + page]: true,
      page_url: base + (page === 'index' ? '/' : '/' + file),
      // Each page can have its own Google description; otherwise the one in Site settings is used.
      page_description: (data[page === 'index' ? 'home' : page] || {}).seo_description || data.site.description,
      page_title: page === 'index' ? data.site.title : `${data[page].title} · ${data.site.title}`,
      og_image: base + '/' + String(data.home.hero.image || '').replace(/^\//, ''),
    });
    const schema = base && (page === 'index' || page === 'visit') ? businessSchema(data, base) : '';
    fs.writeFileSync(path.join(OUT, file), render(tpl, [ctx], file).replace('<!--business-schema-->', schema));
  }
  // start.html: START is now part of the Apply page; this small page sends old links there.
  for (const f of ['site.css', 'site.js', 'favicon.svg', 'apple-touch-icon.png', '404.html', 'start.html']) fs.copyFileSync(path.join(ROOT, 'src', f), path.join(OUT, f));
  // Old addresses from the Wix site get a small page that sends visitors (and Google) to the new page.
  // Unlike the 404 page's fallback, these answer "found", so Google moves the old results across.
  for (const [from, to] of Object.entries(OLD_WIX_PAGES)) {
    const target = (siteBaseFor(data) || '') + '/' + to;
    const dir = path.join(OUT, from);
    fs.mkdirSync(dir, { recursive: true });
    const up = '../'.repeat(from.split('/').length);
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>\n<html lang="en-GB">\n<head>\n<meta charset="utf-8">\n<title>Moved · ${escapeHTML(data.site.title)}</title>\n<link rel="canonical" href="${escapeHTML(target)}">\n<meta http-equiv="refresh" content="0; url=${escapeHTML(up + to)}">\n</head>\n<body>\n<p>This page has moved: <a href="${escapeHTML(up + to)}">continue</a>.</p>\n<script>location.replace(${JSON.stringify(up + to)} + location.hash)</script>\n</body>\n</html>\n`);
  }
  copyDir(path.join(ROOT, 'images'), path.join(OUT, 'images'));
  // Until launch, ask search engines not to list the site (each page also carries a noindex tag).
  const siteBase = String(data.site.site_url || '').replace(/\/+$/, '');
  const listed = data.site.launched && siteBase;
  fs.writeFileSync(path.join(OUT, 'robots.txt'), data.site.launched ? 'User-agent: *\nAllow: /\n' + (listed ? `Sitemap: ${siteBase}/sitemap.xml\n` : '') : 'User-agent: *\nDisallow: /\n');
  if (listed) {
    const urls = PAGES.map((p) => `  <url><loc>${siteBase}${p === 'index' ? '/' : '/' + p + '.html'}</loc></url>`).join('\n');
    fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  }
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  console.log(`Built ${PAGES.length} pages into _site/ (${data.site.launched ? 'launched' : 'preview, not indexed'})`);
}

if (require.main === module) {
  build().catch((e) => { console.error('Build failed: ' + e.message); process.exit(1); });
}
module.exports = { render, escapeHTML };
