import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  forbiddenHits,
  isLocalAsset,
  checkRoot,
  formProblems,
} from './check-lead-forms.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptSource = fs.readFileSync(path.join(root, 'js', 'tdp-leads.js'), 'utf8');
const PHONE = '(830) 356-7319';
const PROFILE = '63e7470e-fe1e-4367-aae0-56d0d6392d78';

function createElement(tag) {
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attrs: {},
    style: {},
    dataset: {},
    className: '',
    textContent: '',
    value: '',
    disabled: false,
    type: '',
    name: '',
    id: '',
    src: '',
    defer: false,
    tabIndex: 0,
    autocomplete: '',
    parentNode: null,
    listeners: {},
    setAttribute(name, value) {
      this.attrs[name] = String(value);
      if (name === 'class') this.className = String(value);
      if (name === 'name') this.name = String(value);
      if (name === 'type') this.type = String(value);
      if (name === 'id') this.id = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    removeAttribute(name) {
      delete this.attrs[name];
      if (name === 'class') this.className = '';
      if (name === 'type') this.type = '';
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    addEventListener(type, fn) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(fn);
    },
    querySelector(sel) {
      return selectAll(this, sel)[0] || null;
    },
    querySelectorAll(sel) {
      return selectAll(this, sel);
    },
    reset() {
      const visit = (n) => {
        for (const child of n.children) {
          if (child.tagName === 'INPUT' || child.tagName === 'TEXTAREA' || child.tagName === 'SELECT') {
            child.value = '';
          }
          visit(child);
        }
      };
      visit(this);
    },
  };
  return node;
}

function classList(node) {
  return String(node.className || '')
    .split(/\s+/)
    .filter(Boolean);
}

function matches(node, selector) {
  const sel = selector.trim();
  if (!sel) return false;
  if (sel.startsWith('.')) return classList(node).includes(sel.slice(1));
  let found = sel.match(/^\[name="([^"]+)"\]$/);
  if (found) return node.name === found[1];
  found = sel.match(/^button\[type="([^"]+)"\]$/);
  if (found) return node.tagName === 'BUTTON' && (node.type === found[1] || node.getAttribute('type') === found[1]);
  if (sel === 'button:not([type])') return node.tagName === 'BUTTON' && !node.getAttribute('type');
  return sel.toLowerCase() === node.tagName.toLowerCase();
}

function selectAll(rootNode, selector) {
  const parts = selector.split(',').map((part) => part.trim());
  const out = [];
  const walk = (n) => {
    for (const child of n.children || []) {
      if (parts.some((part) => matches(child, part))) out.push(child);
      walk(child);
    }
  };
  walk(rootNode);
  return out;
}

function field(tag, attrs, text) {
  const node = createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}

function harness(options = {}) {
  const clock = { now: options.now == null ? 1_700_000_000_000 : options.now };
  const calls = [];
  let fetchImpl = options.fetch;
  const documentElement = createElement('html');
  const head = createElement('head');
  const body = createElement('body');
  documentElement.appendChild(head);
  documentElement.appendChild(body);
  const document = createElement('#document');
  document.appendChild(documentElement);
  document.head = head;
  document.body = body;
  document.documentElement = documentElement;
  document.readyState = 'interactive';
  document.createElement = createElement;

  const form = createElement('form');
  if (options.action) form.setAttribute('action', options.action);
  if (options.method) form.setAttribute('method', options.method);
  form.appendChild(field('input', { type: 'text', name: 'name' }));
  form.appendChild(field('input', { type: 'email', name: 'email' }));
  form.appendChild(field('input', { type: 'tel', name: 'phone' }));
  form.appendChild(field('textarea', { name: 'message' }));
  form.appendChild(field('input', { type: 'text', name: 'service' }));
  form.appendChild(field('input', { type: 'text', name: 'area' }));
  form.appendChild(field('input', { type: 'text', name: 'company_website', id: 'company_website' }));
  const button = field('button', { type: 'submit' }, 'Request Free Estimate');
  form.appendChild(button);
  const status = createElement('p');
  status.className = 'form-status';
  status.setAttribute('class', 'form-status');
  form.appendChild(status);
  body.appendChild(form);

  const href =
    options.href ||
    'https://txkerrvilleplumbing.com/?utm_source=google&utm_medium=cpc&utm_campaign=leak#contact';
  const search = options.search == null ? href.slice(href.indexOf('?')) : options.search;
  const sandbox = {
    console,
    JSON,
    URLSearchParams,
    Promise,
    Date: { now() { return clock.now; } },
    document,
    location: { href, search: search.split('#')[0].includes('?') ? search.split('#')[0].slice(search.split('#')[0].indexOf('?')) : '' },
    fetch: async (url, init) => {
      calls.push({
        url,
        init,
        disabled: button.disabled,
        label: button.textContent,
      });
      if (fetchImpl) return fetchImpl(url, init);
      return { status: 201 };
    },
  };
  sandbox.window = sandbox;
  if (options.attribution !== null) {
    sandbox.__tdpLeadAttribution = true;
    sandbox.tdpLeadAttribution =
      options.attribution ||
      function () {
        return {
          landing_url: 'https://txkerrvilleplumbing.com/?utm_source=google&utm_medium=cpc&utm_campaign=leak',
          first_touch_url: 'https://txkerrvilleplumbing.com/?utm_source=google&utm_medium=cpc&utm_campaign=leak',
          utm_source: 'google',
          utm_medium: 'cpc',
          utm_campaign: 'leak',
        };
      };
  }

  vm.createContext(sandbox);
  vm.runInContext(scriptSource, sandbox, { filename: 'js/tdp-leads.js' });

  const named = (name) => form.querySelector('[name="' + name + '"]');
  return {
    form,
    button,
    status,
    calls,
    clock,
    head,
    document,
    sandbox,
    setFetch(fn) {
      fetchImpl = fn;
    },
    fill(values) {
      for (const [key, value] of Object.entries(values)) named(key).value = value;
    },
    async submit() {
      const event = {
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
      };
      const listeners = form.listeners.submit || [];
      for (const fn of listeners) await fn(event);
      return event;
    },
  };
}

function posted(call) {
  assert.equal(call.url, 'https://www.tradedeskpro.com/api/leads');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(Object.keys(call.init.headers), ['Content-Type']);
  return JSON.parse(call.init.body);
}

test('201 posts the lead and shows success', async () => {
  const ui = harness();
  ui.fill({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '830-356-0199',
    service: 'Leak Repair',
    area: 'Kerrville',
    message: 'Slab leak in the hall',
  });
  ui.clock.now += 4000;
  const event = await ui.submit();
  assert.equal(event.defaultPrevented, true);
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].disabled, true);
  assert.equal(ui.calls[0].label, 'Sending...');
  const body = posted(ui.calls[0]);
  assert.equal(body.name, 'Ada Lovelace');
  assert.equal(body.profile_id, PROFILE);
  assert.equal(body.phone, '830-356-0199');
  assert.equal(body.company_website, undefined);
  assert.equal(body.email, 'ada@example.com');
  assert.equal(body.source, 'txkerrvilleplumbing.com');
  assert.equal(body.message, 'Service: Leak Repair\nArea: Kerrville\nSlab leak in the hall');
  assert.equal(body.landing_url, ui.sandbox.location.href);
  assert.equal(body.first_touch_url, 'https://txkerrvilleplumbing.com/?utm_source=google&utm_medium=cpc&utm_campaign=leak');
  assert.equal(body.utm_source, 'google');
  assert.equal(body.utm_medium, 'cpc');
  assert.equal(body.utm_campaign, 'leak');
  assert.equal(ui.button.disabled, false);
  assert.equal(ui.button.textContent, 'Request Free Estimate');
  assert.equal(ui.form.querySelector('[name="name"]').value, '');
  assert.match(ui.status.textContent, /Request received/);
  assert.match(ui.status.className, /\bok\b/);
  assert.equal(ui.form.getAttribute('action'), null);
  assert.equal(ui.form.getAttribute('method'), null);
});

test('202 filtered is shown as success', async () => {
  const ui = harness({ fetch: async () => ({ status: 202 }) });
  ui.fill({ name: 'Grace Hopper', phone: '8303567319', email: 'grace@example.com', message: 'No hot water' });
  ui.clock.now += 3000;
  await ui.submit();
  assert.equal(ui.calls.length, 1);
  assert.match(ui.status.textContent, /Request received/);
  assert.doesNotMatch(ui.status.textContent, /filter|spam|error/i);
});

test('403, 429, 500, and network errors offer the site phone', async () => {
  const cases = [
    [{ status: 403 }, /couldn't send your request from this page/],
    [{ status: 429 }, /lot of requests/],
    [{ status: 500 }, /couldn't send your request\./],
    [() => Promise.reject(new Error('offline')), /couldn't send your request\./],
  ];
  for (const [response, pattern] of cases) {
    const ui = harness({
      fetch: typeof response === 'function' ? response : async () => response,
    });
    ui.fill({ name: 'Pat', phone: '8303567319', message: 'Backup' });
    ui.clock.now += 5000;
    await ui.submit();
    assert.match(ui.status.textContent, pattern);
    assert.match(ui.status.textContent, new RegExp(PHONE.replace(/[()]/g, '\\$&')));
    assert.match(ui.status.className, /\berror\b/);
    assert.equal(ui.button.disabled, false);
  }
});

test('honeypot and sub-3s submits do not post', async () => {
  const honey = harness();
  honey.fill({ name: 'Bot', phone: '8303567319', company_website: 'https://spam.example' });
  honey.clock.now += 9000;
  await honey.submit();
  assert.equal(honey.calls.length, 0);
  assert.match(honey.status.textContent, /Request received/);

  const fast = harness();
  fast.fill({ name: 'Speedy', phone: '8303567319', message: 'Leak' });
  fast.clock.now += 2999;
  await fast.submit();
  assert.equal(fast.calls.length, 0);
  assert.match(fast.status.textContent, /Request received/);

  const ready = harness();
  ready.fill({ name: 'Speedy', phone: '8303567319', message: 'Leak' });
  ready.clock.now += 3000;
  await ready.submit();
  assert.equal(ready.calls.length, 1);
});

test('missing name or phone does not post', async () => {
  const ui = harness();
  ui.fill({ name: '   ', phone: '', message: 'Hello' });
  ui.clock.now += 8000;
  await ui.submit();
  assert.equal(ui.calls.length, 0);
  assert.match(ui.status.textContent, /name and phone/);
  assert.match(ui.status.textContent, /830/);
});

test('utm fields fall back to the page URL', async () => {
  const ui = harness({ attribution: null });
  ui.fill({ name: 'Lin', phone: '8303567319', message: 'Clog' });
  ui.clock.now += 4000;
  await ui.submit();
  const body = posted(ui.calls[0]);
  assert.equal(body.utm_source, 'google');
  assert.equal(body.utm_medium, 'cpc');
  assert.equal(body.utm_campaign, 'leak');
  assert.equal(body.utm_term, undefined);
  assert.equal(body.landing_url, ui.sandbox.location.href);
  assert.equal(body.source, 'txkerrvilleplumbing.com');
});

test('attribution script is injected when it is not already on the page', () => {
  const ui = harness({ attribution: null });
  const scripts = ui.head.children.filter((node) => node.tagName === 'SCRIPT');
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://www.tradedeskpro.com/js/tdp-lead-attribution.js');
  assert.equal(scripts[0].defer, true);
});

test('client script has no lead secret and removes a leftover action', () => {
  assert.equal(scriptSource.includes('X-TDP-' + 'Lead-Secret'), false);
  assert.equal(scriptSource.includes(PROFILE), true);
  const ui = harness({ action: 'https://example.invalid/old', method: 'post' });
  assert.equal(ui.form.getAttribute('action'), null);
  assert.equal(ui.form.getAttribute('method'), null);
});

test('placeholder and 555- patterns fail the checker', () => {
  assert.deepEqual(forbiddenHits('hello ' + 'form' + 'spree.io/f/abc'), ['form' + 'spree']);
  assert.ok(forbiddenHits('YOUR_' + 'FORM_ID').includes('YOUR_' + 'FORM_ID'));
  assert.ok(forbiddenHits('REPLACE_' + 'WITH_ANYTHING').includes('REPLACE_' + 'WITH'));
  assert.ok(forbiddenHits('(830) 55' + '5-0100').includes('555-number'));
  assert.ok(forbiddenHits('(55' + '5) 010-0000').includes('555-paren'));
  assert.deepEqual(forbiddenHits('Call (830) 356-7319 for a free estimate.'), []);
  assert.equal(isLocalAsset('/js/tdp-leads.js'), true);
  assert.equal(isLocalAsset('https://www.tradedeskpro.com/js/tdp-lead-attribution.js'), false);
  assert.equal(isLocalAsset('/blog/index.html'), false);
  assert.equal(isLocalAsset('tel:+18303567319'), false);
  assert.equal(isLocalAsset('#contact'), false);
  assert.deepEqual(formProblems('<form id="lead-form"></form>'), ['form is missing /js/tdp-leads.js']);
  assert.deepEqual(
    formProblems('<form action="https://example.invalid"></form><script src="/js/tdp-leads.js"></script>'),
    ['form still has an action attribute']
  );
});

test('checker flags a missing local asset and passes this repo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lead-check-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<script src="/js/missing.js"></script>\n');
  const problems = checkRoot(dir);
  assert.ok(problems.some((line) => line.includes('missing local asset /js/missing.js')));

  fs.mkdirSync(path.join(dir, 'js'));
  fs.writeFileSync(path.join(dir, 'js', 'missing.js'), '/* ok */\n');
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    '<script src="js/missing.js"></script>\n<script src="https://example.com/app.js"></script>\n'
  );
  assert.deepEqual(checkRoot(dir), []);

  fs.writeFileSync(path.join(dir, 'page.html'), '<form id="lead-form"></form>\n');
  const again = checkRoot(dir);
  assert.ok(again.some((line) => line.includes('form is missing')));
  assert.equal(again.some((line) => line.includes('example.com')), false);

  const repoProblems = checkRoot(root);
  assert.deepEqual(repoProblems, []);
});
