/*
 * interactions.js — shared behaviour for generated static sites.
 *
 * Vendored into each site. No dependencies, no build step. Everything here is
 * progressive: with JavaScript disabled the page is exactly the page it was, and nothing
 * that matters is behind a script.
 *
 * 1. External links open in a new tab, safely.
 * 2. Content photographs open in a lightbox, with grouped photos becoming a carousel.
 * 3. The nav gains a shadow once the page has scrolled.
 * 4. A hamburger toggles the nav on small screens.
 * 5. A scroll-progress bar tracks depth through the page.
 * 6. Today's row is marked in any opening-hours table.
 *
 * 1 and 2 are opt-out via data-no-enhance on any ancestor.
 */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- external links */

  function isExternal(a) {
    if (!a.href) return false;
    var p = a.protocol;
    // tel:, mailto:, sms: must stay in place. Opening a phone link in a tab on mobile
    // leaves a dead blank tab behind after the call sheet closes.
    if (p !== 'http:' && p !== 'https:') return false;
    if (a.hasAttribute('download')) return false;
    return a.hostname !== window.location.hostname;
  }

  Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
    if (a.closest('[data-no-enhance]')) return;
    if (!isExternal(a)) return;
    a.target = '_blank';
    // noopener closes the reverse-tabnabbing hole; noreferrer also strips the Referer.
    var rel = (a.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
    if (rel.indexOf('noopener') < 0) rel.push('noopener');
    if (rel.indexOf('noreferrer') < 0) rel.push('noreferrer');
    a.setAttribute('rel', rel.join(' '));
    // Tell a screen reader the link behaves differently, without visual noise.
    if (!a.getAttribute('aria-label') && a.textContent.trim()) {
      a.setAttribute('aria-label', a.textContent.trim() + ' (opens in a new tab)');
    }
  });

  /* ------------------------------------------------------------- sticky nav + menu */

  var nav = document.querySelector('[data-nav]') || document.querySelector('.site-nav');

  if (nav) {
    // A shadow only once the page has actually moved. A nav shadowed at rest reads as a
    // floating bar rather than part of the page.
    var onScrollNav = function () { nav.classList.toggle('is-stuck', window.scrollY > 8); };
    onScrollNav();
    window.addEventListener('scroll', onScrollNav, {passive: true});

    var toggle = nav.querySelector('[data-menu-toggle]');
    var panel = nav.querySelector('[data-menu]');
    if (toggle && panel) {
      var setOpen = function (open) {
        nav.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        // Locking the body is what stops the page scrolling behind an open menu on iOS.
        document.body.style.overflow = open ? 'hidden' : '';
      };
      setOpen(false);
      toggle.addEventListener('click', function () {
        setOpen(!nav.classList.contains('is-open'));
      });
      panel.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
      });
      // Rotating back to desktop with the menu open would otherwise leave the body locked.
      window.addEventListener('resize', function () {
        if (window.innerWidth > 820 && nav.classList.contains('is-open')) setOpen(false);
      });
    }
  }

  /* ------------------------------------------------------------------ progress bar */

  var bar = document.querySelector('[data-progress]');
  if (bar) {
    var fill = bar.firstElementChild || bar;
    var ticking = false;
    // scaleX on a compositor-friendly property, driven by requestAnimationFrame. Setting
    // width directly on every scroll event is exactly what makes these feel wonky: it
    // forces layout on the main thread dozens of times a second and the bar visibly lags
    // the scroll it is supposed to be reporting.
    var paint = function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      var pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      fill.style.transform = 'scaleX(' + pct + ')';
      bar.setAttribute('aria-valuenow', Math.round(pct * 100));
      ticking = false;
    };
    var request = function () { if (!ticking) { ticking = true; requestAnimationFrame(paint); } };
    paint();
    window.addEventListener('scroll', request, {passive: true});
    window.addEventListener('resize', request);
  }

  /* ----------------------------------------------------------------- today's hours */

  // Mark today's row in an opening-hours table. Rows opt in with data-day="Mon".
  // Resolved in the browser rather than at build time on purpose: these are static files
  // that may sit cached for days, so a baked-in "today" would go stale and then
  // confidently highlight the wrong row, which is worse than highlighting none.
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var today = DAYS[new Date().getDay()].toLowerCase();
  Array.prototype.forEach.call(document.querySelectorAll('[data-day]'), function (row) {
    if ((row.getAttribute('data-day') || '').slice(0, 3).toLowerCase() !== today) return;
    row.classList.add('is-today');
    if (row.querySelector('[data-today-label]')) return;
    // Colour alone is not an accessible signal, so say it in text too.
    var tag = document.createElement('span');
    tag.setAttribute('data-today-label', '');
    tag.className = 'today-tag';
    tag.textContent = 'Today';
    (row.firstElementChild || row).appendChild(tag);
  });

  /* --------------------------------------------------------------------- lightbox */

  // Only content photography. A logo, an icon, a decorative rule and anything already
  // inside a link are all left alone: wrapping a logo in a zoom is noise, and hijacking
  // a link's click steals a navigation the visitor asked for.
  var MIN = 400; // natural px on the long edge; below this there is nothing to enlarge

  function eligible(img) {
    if (img.closest('a, button, [data-no-enhance], [data-no-zoom]')) return false;
    if (img.classList.contains('logo') || /logo|icon|favicon/i.test(img.getAttribute('src') || '')) return false;
    if (!img.getAttribute('alt')) return false;         // decorative images are not content
    var w = img.naturalWidth || img.width || 0;
    var h = img.naturalHeight || img.height || 0;
    return Math.max(w, h) >= MIN;
  }

  function groupOf(img) {
    var f = img.closest('[data-gallery]');
    if (f) return f.getAttribute('data-gallery');
    // Photos sharing a grid or list are the same set as far as a visitor is concerned.
    var parent = img.closest('figure') ? img.closest('figure').parentElement : img.parentElement;
    return parent ? 'auto:' + (parent.className || parent.tagName) : 'single';
  }

  var imgs = Array.prototype.filter.call(document.images, eligible);
  if (!imgs.length) return;

  var groups = {};
  imgs.forEach(function (img) {
    var g = groupOf(img);
    (groups[g] = groups[g] || []).push(img);
  });

  var css = document.createElement('style');
  css.textContent = [
    '.lb-open{cursor:zoom-in}',
    '.lb{position:fixed;inset:0;z-index:9999;display:none;align-items:center;',
    'justify-content:center;background:rgba(8,8,10,.94);padding:24px}',
    '.lb[open],.lb.is-open{display:flex}',
    '.lb figure{margin:0;max-width:100%;max-height:100%;display:flex;flex-direction:column;',
    'align-items:center;gap:12px}',
    '.lb img{max-width:min(100%,1400px);max-height:78vh;width:auto;height:auto;',
    'object-fit:contain;border-radius:3px;background:#111}',
    '.lb figcaption{color:#f2f2f2;font-size:.9rem;line-height:1.45;text-align:center;',
    'max-width:70ch;opacity:.92}',
    '.lb-btn{position:absolute;background:rgba(255,255,255,.10);color:#fff;border:0;',
    'width:48px;height:48px;border-radius:50%;font-size:22px;line-height:1;cursor:pointer;',
    'display:grid;place-items:center}',
    '.lb-btn:hover{background:rgba(255,255,255,.22)}',
    '.lb-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}',
    '.lb-close{top:16px;right:16px}.lb-prev{left:12px}.lb-next{right:12px}',
    '.lb-count{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);',
    'color:#fff;opacity:.7;font-size:.8rem;letter-spacing:.08em}',
    '@media (max-width:600px){.lb{padding:12px}.lb-prev{left:6px}.lb-next{right:6px}}',
    reduce ? '' : '.lb img{transition:opacity .15s ease}'
  ].join('');
  document.head.appendChild(css);

  var lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Enlarged image');
  lb.innerHTML =
    '<button class="lb-btn lb-close" aria-label="Close">×</button>' +
    '<button class="lb-btn lb-prev" aria-label="Previous image">‹</button>' +
    '<figure><img alt=""><figcaption></figcaption></figure>' +
    '<button class="lb-btn lb-next" aria-label="Next image">›</button>' +
    '<p class="lb-count" aria-live="polite"></p>';
  document.body.appendChild(lb);

  var lbImg = lb.querySelector('img');
  var lbCap = lb.querySelector('figcaption');
  var lbCount = lb.querySelector('.lb-count');
  var btnPrev = lb.querySelector('.lb-prev');
  var btnNext = lb.querySelector('.lb-next');
  var current = [];
  var idx = 0;
  var lastFocus = null;

  function captionFor(img) {
    var fig = img.closest('figure');
    var cap = fig && fig.querySelector('figcaption');
    return (cap && cap.textContent.trim()) || img.getAttribute('alt') || '';
  }

  function show(i) {
    idx = (i + current.length) % current.length;
    var img = current[idx];
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.getAttribute('alt') || '';
    lbCap.textContent = captionFor(img);
    var many = current.length > 1;
    btnPrev.hidden = btnNext.hidden = !many;
    lbCount.textContent = many ? (idx + 1) + ' / ' + current.length : '';
  }

  function open(group, i) {
    current = group;
    lastFocus = document.activeElement;
    show(i);
    lb.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    lb.querySelector('.lb-close').focus();
  }

  function close() {
    lb.classList.remove('is-open');
    document.body.style.overflow = '';
    lbImg.removeAttribute('src');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  Object.keys(groups).forEach(function (g) {
    var set = groups[g];
    set.forEach(function (img, i) {
      img.classList.add('lb-open');
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', (img.getAttribute('alt') || 'Image') + ' (enlarge)');
      img.addEventListener('click', function () { open(set, i); });
      img.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(set, i); }
      });
    });
  });

  lb.querySelector('.lb-close').addEventListener('click', close);
  btnPrev.addEventListener('click', function () { show(idx - 1); });
  btnNext.addEventListener('click', function () { show(idx + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });

  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(idx - 1);
    else if (e.key === 'ArrowRight') show(idx + 1);
    else if (e.key === 'Tab') {
      // Focus trap: keep tabbing inside the dialog while it is open.
      var f = Array.prototype.filter.call(lb.querySelectorAll('button'), function (b) { return !b.hidden; });
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Swipe, for the carousel on touch.
  var x0 = null;
  lb.addEventListener('touchstart', function (e) { x0 = e.changedTouches[0].clientX; }, {passive: true});
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45 && current.length > 1) show(idx + (dx < 0 ? 1 : -1));
    x0 = null;
  }, {passive: true});
})();

/* ------------------------------------------------------------- scroll reveals
 * Progressive: without JS the .js-anim class never lands and everything is
 * simply visible. With reduced motion preferred, the class is never added. */
(function () {
  'use strict';
  if (!document.documentElement.classList.contains('js-anim')) return;
  if (!('IntersectionObserver' in window)) {
    document.documentElement.classList.remove('js-anim');
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  Array.prototype.forEach.call(document.querySelectorAll('.rv'), function (el) {
    io.observe(el);
  });
})();
