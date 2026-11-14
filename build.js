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
const PAGES = ['index', 'train', 'memberships', 'visit'];

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

function build() {
  const data = relativeAssets({
    site: readJSON('site'),
    home: readJSON('home'),
    train: readJSON('train'),
    memberships: readJSON('memberships'),
    visit: readJSON('visit'),
  });

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
  try { build(); } catch (e) { console.error('Build failed: ' + e.message); process.exit(1); }
}
module.exports = { render, escapeHTML };
