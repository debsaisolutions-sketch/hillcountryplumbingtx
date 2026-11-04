/**
 * Fails if a placeholder form endpoint, placeholder id, or 555- phone number
 * is committed, or if a page references a local asset that is not in the repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT_EXT = new Set([
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
  '.yml',
  '.yaml',
  '.txt',
  '.md',
  '.svg',
  '.xml',
]);

const ASSET_EXT = /\.(?:js|mjs|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|map)$/i;

const PROFILE_ID = '63e7470e-fe1e-4367-aae0-56d0d6392d78';
const SITE_PHONE = '(830) 356-7319';
const SITE_DOMAIN = 'txkerrvilleplumbing.com';
const API_URL = 'https://www.tradedeskpro.com/api/leads';

export function repoRootFromMeta(metaUrl) {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), '..');
}

export function forbiddenRules() {
  return [
    ['form' + 'spree', new RegExp('form' + 'spree', 'i')],
    ['YOUR_' + 'FORM_ID', new RegExp('YOUR_' + 'FORM_ID')],
    ['REPLACE_' + 'WITH', new RegExp('REPLACE_' + 'WITH')],
    ['555-number', new RegExp('55' + '5-\\d')],
    ['555-paren', new RegExp('\\(55' + '5\\)')],
    ['lead-secret', new RegExp('X-TDP-' + 'Lead-Secret', 'i')],
  ];
}

export function forbiddenHits(text) {
  const hits = [];
  for (const [name, re] of forbiddenRules()) {
    if (re.test(text)) hits.push(name);
  }
  return hits;
}

export function isLocalAsset(url) {
  if (!url) return false;
  const value = String(url).trim();
  if (!value || value.startsWith('#') || value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('javascript:')) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return false;
  const pathOnly = value.split('#')[0].split('?')[0];
  return ASSET_EXT.test(pathOnly);
}

export function resolveLocalAsset(root, fromFile, url) {
  const pathOnly = decodeURIComponent(String(url).trim().split('#')[0].split('?')[0]);
  if (pathOnly.startsWith('/')) return path.normalize(path.join(root, pathOnly));
  return path.normalize(path.resolve(path.dirname(fromFile), pathOnly));
}

export function localAssetUrls(text) {
  const urls = [];
  const attr = /(?:src|href)\s*=\s*(['"])(.*?)\1/gi;
  const cssUrl = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
  let match;
  while ((match = attr.exec(text))) urls.push(match[2]);
  while ((match = cssUrl.exec(text))) urls.push(match[2]);
  return urls;
}

export function formProblems(text) {
  const problems = [];
  if (/<form\b/i.test(text) && !/js\/tdp-leads\.js/.test(text)) {
    problems.push('form is missing /js/tdp-leads.js');
  }
  const action = /<form\b[^>]*\baction\s*=/i;
  if (action.test(text)) problems.push('form still has an action attribute');
  return problems;
}

function walkFiles(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

export function checkRoot(root) {
  const problems = [];
  const files = walkFiles(root, []);
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(root, file);
    for (const hit of forbiddenHits(text)) {
      problems.push(rel + ': forbidden ' + hit);
    }
    if (ext === '.html' || ext === '.htm') {
      for (const problem of formProblems(text)) problems.push(rel + ': ' + problem);
    }
    if (ext === '.html' || ext === '.htm' || ext === '.css') {
      for (const url of localAssetUrls(text)) {
        if (!isLocalAsset(url)) continue;
        let resolved;
        try {
          resolved = resolveLocalAsset(root, file, url);
        } catch (e) {
          problems.push(rel + ': bad asset url ' + url);
          continue;
        }
        const relAsset = path.relative(root, resolved);
        if (relAsset.startsWith('..') || path.isAbsolute(relAsset)) {
          problems.push(rel + ': asset escapes repo ' + url);
          continue;
        }
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
          problems.push(rel + ': missing local asset ' + url);
        }
      }
    }
  }

  const leadJsPath = path.join(root, 'js', 'tdp-leads.js');
  if (fs.existsSync(leadJsPath)) {
    const leadJs = fs.readFileSync(leadJsPath, 'utf8');
    if (!leadJs.includes(PROFILE_ID)) problems.push('js/tdp-leads.js: profile id missing');
    if (!leadJs.includes(API_URL)) problems.push('js/tdp-leads.js: api url missing');
    if (!leadJs.includes(SITE_PHONE)) problems.push('js/tdp-leads.js: site phone missing');
    if (!leadJs.includes(SITE_DOMAIN)) problems.push('js/tdp-leads.js: site domain missing');
  }
  return problems;
}

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

export function main() {
  const root = repoRootFromMeta(import.meta.url);
  const problems = checkRoot(root);
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    console.error(problems.length + ' lead-form check problem(s)');
    return 1;
  }
  console.log('lead-form check ok');
  return 0;
}

if (runningAsMain()) {
  process.exit(main());
}
