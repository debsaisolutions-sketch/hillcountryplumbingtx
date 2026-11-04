/**
 * Quote form → TradeDeskPro POST /api/leads.
 * The profile id is the public browser intake id. Never send a lead secret from here.
 * Attribution (landing URL, first touch, utm_*) comes from tdp-lead-attribution.js.
 */
(function () {
  var API_URL = 'https://www.tradedeskpro.com/api/leads';
  var PROFILE_ID = '63e7470e-fe1e-4367-aae0-56d0d6392d78';
  var SOURCE = 'txkerrvilleplumbing.com';
  var PHONE_FALLBACK = '(830) 356-7319';
  var MIN_SUBMIT_MS = 3000;
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  var loadedAt = Date.now();

  (function loadAttribution() {
    if (typeof document === 'undefined') return;
    if (window.__tdpLeadAttribution) return;
    var s = document.createElement('script');
    s.src = 'https://www.tradedeskpro.com/js/tdp-lead-attribution.js';
    s.defer = true;
    (document.head || document.documentElement).appendChild(s);
  })();

  function fieldValue(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    if (!el) return '';
    return String(el.value || '').trim();
  }

  function readAttribution() {
    var extra = {};
    try {
      if (typeof window.tdpLeadAttribution === 'function') {
        extra = window.tdpLeadAttribution() || {};
      }
    } catch (e) {
      extra = {};
    }

    try {
      var params = new URLSearchParams(window.location.search || '');
      for (var i = 0; i < UTM_KEYS.length; i++) {
        var key = UTM_KEYS[i];
        if (!extra[key]) {
          var fromUrl = params.get(key);
          if (fromUrl) extra[key] = fromUrl;
        }
      }
    } catch (e2) {}

    if (!extra.landing_url) {
      try {
        extra.landing_url = window.location.href;
      } catch (e3) {}
    }
    return extra;
  }

  function buildMessage(form) {
    var service = fieldValue(form, 'service');
    var area = fieldValue(form, 'area');
    var details = fieldValue(form, 'message') || fieldValue(form, 'details');
    var lines = [];
    if (service) lines.push('Service: ' + service);
    if (area) lines.push('Area: ' + area);
    if (details) lines.push(details);
    return lines.join('\n');
  }

  function statusEl(form) {
    var el = form.querySelector('.form-status');
    if (!el) {
      el = document.createElement('p');
      el.className = 'form-status';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      form.appendChild(el);
    }
    return el;
  }

  function showStatus(form, kind, text) {
    var el = statusEl(form);
    el.className = 'form-status ' + kind;
    el.textContent = text;
  }

  function showSuccess(form) {
    showStatus(
      form,
      'ok',
      "Request received. We'll contact you within 1 hour during business hours."
    );
    form.reset();
  }

  function isLeadForm(form) {
    return !!(form.querySelector('[name="name"]') && form.querySelector('[name="phone"]'));
  }

  function wireForm(form) {
    if (!form || form.dataset.tdpWired === '1' || !isLeadForm(form)) return;
    form.dataset.tdpWired = '1';
    form.removeAttribute('action');
    form.removeAttribute('method');

    if (!form.querySelector('[name="company_website"]')) {
      var wrap = document.createElement('div');
      wrap.className = 'hp-field';
      wrap.setAttribute('aria-hidden', 'true');
      var hp = document.createElement('input');
      hp.type = 'text';
      hp.name = 'company_website';
      hp.tabIndex = -1;
      hp.autocomplete = 'off';
      wrap.appendChild(hp);
      form.appendChild(wrap);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (fieldValue(form, 'company_website')) {
        showSuccess(form);
        return;
      }

      var name = fieldValue(form, 'name');
      var phone = fieldValue(form, 'phone');
      var email = fieldValue(form, 'email');
      if (!name || !phone) {
        showStatus(
          form,
          'error',
          'Please enter your name and phone number, or call ' + PHONE_FALLBACK + '.'
        );
        return;
      }

      if (Date.now() - loadedAt < MIN_SUBMIT_MS) {
        showSuccess(form);
        return;
      }

      var attr = readAttribution();
      var landing = '';
      try {
        landing = window.location.href || '';
      } catch (eLoc) {}
      if (!landing) landing = attr.landing_url || '';

      var body = {
        name: name,
        profile_id: PROFILE_ID,
        phone: phone,
        email: email,
        message: buildMessage(form),
        source: SOURCE,
        landing_url: landing,
      };
      if (attr.first_touch_url) body.first_touch_url = attr.first_touch_url;
      else if (landing) body.first_touch_url = landing;
      for (var i = 0; i < UTM_KEYS.length; i++) {
        var key = UTM_KEYS[i];
        if (attr[key]) body[key] = attr[key];
      }

      var btn = form.querySelector('button[type="submit"], button:not([type])');
      var original = btn ? btn.textContent : '';
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending...';
      }

      return fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (res) {
          var status = res && res.status;
          if (status === 403) {
            showStatus(
              form,
              'error',
              "We couldn't send your request from this page. Please call " +
                PHONE_FALLBACK +
                " and we'll help right away."
            );
            return;
          }
          if (status === 429) {
            showStatus(
              form,
              'error',
              "We're getting a lot of requests right now. Please call " +
                PHONE_FALLBACK +
                ' or try again in a few minutes.'
            );
            return;
          }
          if (status === 201 || status === 202 || (status >= 200 && status < 300)) {
            showSuccess(form);
            return;
          }
          showStatus(
            form,
            'error',
            "We couldn't send your request. Please call " +
              PHONE_FALLBACK +
              " and we'll help right away."
          );
        })
        .catch(function () {
          showStatus(
            form,
            'error',
            "We couldn't send your request. Please call " +
              PHONE_FALLBACK +
              " and we'll help right away."
          );
        })
        .then(function () {
          if (btn) {
            btn.disabled = false;
            btn.textContent = original;
          }
        });
    });
  }

  function init() {
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) wireForm(forms[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
