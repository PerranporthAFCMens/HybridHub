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
const PAGES = ['index', 'train', 'memberships', 'visit', 'apply', 'start', 'recovery'];
const FIELD_TYPES = ['text', 'email', 'tel', 'date', 'radio', 'checkboxes', 'textarea'];

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
    if ((type === 'radio' || type === 'checkboxes') && !(f.options || []).length) console.warn(`Warning: ${file}: "${f.label}" has no choices`);
    return Object.assign({ required: false, options: [] }, f, { type, name, id: 'f-' + name, ['is_' + type]: true });
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
      day.classes.push({ sort: start.getTime(), start: `${s.hour}:${s.minute}`, end: `${f.hour}:${f.minute}`, title: String(e.title || 'Class').trim() });
    }
    for (const d of days) d.classes.sort((a, b) => a.sort - b.sort);
    console.log(`Timetable: ${events.length} classes read from WodBoard`);
    return days;
  } catch (err) {
    console.warn(`Warning: couldn't read the WodBoard timetable (${err.message}); showing WodBoard's embed instead`);
    return null;
  }
}

async function build() {
  const data = relativeAssets({
    site: readJSON('site'),
    home: readJSON('home'),
    train: readJSON('train'),
    memberships: readJSON('memberships'),
    visit: readJSON('visit'),
    apply: readJSON('apply'),
    start: readJSON('start'),
    recovery: readJSON('recovery'),
  });
  data.train.timetable_days = await loadTimetable(data.train);
  data.train.use_own_timetable = !!data.train.timetable_days;
  data.train.use_embed = !data.train.timetable_days;
  for (const page of ['apply', 'start']) data[page].fields = prepareFields(data[page].fields, page + '.json');

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const page of PAGES) {
    const file = page + '.html';
    const tpl = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
    const ctx = Object.assign({}, data, { page, ['is_' + page]: true });
    fs.writeFileSync(path.join(OUT, file), render(tpl, [ctx], file));
  }
  for (const f of ['site.css', 'site.js']) fs.copyFileSync(path.join(ROOT, 'src', f), path.join(OUT, f));
  copyDir(path.join(ROOT, 'images'), path.join(OUT, 'images'));
  // Until launch, ask search engines not to list the site (each page also carries a noindex tag).
  fs.writeFileSync(path.join(OUT, 'robots.txt'), data.site.launched ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n');
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  console.log(`Built ${PAGES.length} pages into _site/ (${data.site.launched ? 'launched' : 'preview, not indexed'})`);
}

if (require.main === module) {
  build().catch((e) => { console.error('Build failed: ' + e.message); process.exit(1); });
}
module.exports = { render, escapeHTML };
