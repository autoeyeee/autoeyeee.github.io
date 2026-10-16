/* ==========================================================================
   custom.js — 交互增强
   --------------------------------------------------------------------------
   做的事：
     1. 顶部阅读进度条
     2. 滚动入场动效（IntersectionObserver）
     3. 宽表格自动包一层横向滚动容器
     4. 导航栏滚动状态
     5. 正文图片懒加载

   设计原则：任何一步出错都不能影响内容可见性。
   —— 入场动效的前提是 <html> 上有 .js（由 inject.head 里的内联脚本添加），
      这里再用一个兜底定时器保证最坏情况下内容也会显示出来。
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  function onReady(fn) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  /* ------------------------------------------------------------------
     1. 顶部阅读进度条
     ------------------------------------------------------------------ */
  function initProgress() {
    var bar = doc.getElementById('dsh-progress');
    if (!bar) {
      bar = doc.createElement('div');
      bar.id = 'dsh-progress';
      bar.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(bar);
    }

    var ticking = false;

    function update() {
      ticking = false;
      var h = doc.documentElement;
      // 文章页：按正文位置算；其他页：按整页算
      var article = doc.getElementById('article-container');
      var start, total;

      if (article) {
        var rect = article.getBoundingClientRect();
        var top = rect.top + window.pageYOffset;
        var vh = window.innerHeight;
        start = Math.max(0, top - vh * 0.35);
        total = Math.max(1, rect.height + (vh * 0.35));
      } else {
        start = 0;
        total = Math.max(1, h.scrollHeight - h.clientHeight);
      }

      var scrolled = window.pageYOffset - start;
      var pct = Math.min(100, Math.max(0, (scrolled / total) * 100));
      bar.style.width = pct.toFixed(2) + '%';
      bar.classList.toggle('is-active', window.pageYOffset > 80);
    }

    function request() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }

    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });
    update();
  }

  /* ------------------------------------------------------------------
     2. 滚动入场动效
     ------------------------------------------------------------------ */
  var REVEAL_SELECTOR = [
    '#recent-posts > .recent-post-item',
    '#aside-content .card-widget',
    '#article-container > h2',
    '#article-container > .kpi-grid',
    '#article-container > .card-grid',
    '#article-container > .steps',
    '#article-container > .compare',
    '#article-container > .flow',
    '#article-container > .slide-cover',
    '#article-container > .figure-card',
    '#article-container > .callout',
    '#article-container > .bars',
    '#article-container > .media',
    '#article-container > table',
    '#article-container > figure',
    '#article-container > .pull-quote'
  ].join(',');

  function reveal(el) {
    el.classList.add('is-visible');
    window.setTimeout(function () {
      el.classList.add('is-done');
    }, 700);
  }

  function initReveal() {
    var nodes = [].slice.call(doc.querySelectorAll(REVEAL_SELECTOR));
    if (!nodes.length) return;

    // 明说不要动效的，直接放过
    nodes = nodes.filter(function (el) {
      return el.getAttribute('data-reveal') !== 'none';
    });

    // 给网格里的子项加逐条延迟，形成错落感
    nodes.forEach(function (el) {
      if (el.matches('.kpi-grid, .card-grid, .steps, .compare')) {
        [].slice.call(el.children).forEach(function (child, i) {
          child.style.setProperty('--d', Math.min(i * 70, 420) + 'ms');
          child.setAttribute('data-reveal', 'up');
        });
        el.setAttribute('data-reveal', 'none');
        return;
      }
      if (!el.getAttribute('data-reveal')) {
        el.setAttribute('data-reveal', 'up');
      }
    });

    // 重新收集（子项此时才带上 data-reveal）
    var all = [].slice.call(doc.querySelectorAll('[data-reveal]')).filter(function (el) {
      return el.getAttribute('data-reveal') !== 'none';
    });

    function revealAll() {
      all.forEach(reveal);
    }

    if (!('IntersectionObserver' in window)) {
      revealAll();
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          reveal(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    all.forEach(function (el) {
      io.observe(el);
    });

    // 兜底：2 秒后仍未出现的，一律显示，避免任何情况下内容被藏住
    window.setTimeout(function () {
      all.forEach(function (el) {
        if (!el.classList.contains('is-visible')) {
          var r = el.getBoundingClientRect();
          if (r.top < window.innerHeight) reveal(el);
        }
      });
    }, 2000);
  }

  /* ------------------------------------------------------------------
     3. 宽表格：包一层横向滚动容器
     ------------------------------------------------------------------ */
  function initTables() {
    var scope = doc.getElementById('article-container');
    if (!scope) return;

    [].slice.call(scope.querySelectorAll('table')).forEach(function (table) {
      if (table.parentElement && table.parentElement.classList.contains('table-wrap')) return;
      if (table.closest('figure.highlight')) return; // 代码块里的行号表格不要动

      var wrap = doc.createElement('div');
      wrap.className = 'table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  /* ------------------------------------------------------------------
     4. 导航栏滚动状态
     ------------------------------------------------------------------ */
  function initNav() {
    var nav = doc.getElementById('nav');
    if (!nav) return;

    var ticking = false;

    function update() {
      ticking = false;
      nav.classList.toggle('nav-scrolled', window.pageYOffset > 60);
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });

    update();
  }

  /* ------------------------------------------------------------------
     5. 正文图片懒加载
     ------------------------------------------------------------------ */
  function initLazyImages() {
    var scope = doc.getElementById('article-container');
    if (!scope) return;

    [].slice.call(scope.querySelectorAll('img')).forEach(function (img) {
      if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
      if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
    });
  }

  /* ------------------------------------------------------------------
     启动：每一步独立 try/catch，互不影响
     ------------------------------------------------------------------ */
  onReady(function () {
    [initProgress, initTables, initNav, initLazyImages, initReveal].forEach(function (step) {
      try {
        step();
      } catch (err) {
        // 静默失败：动效不是必需品，内容可见才是
        if (window.console && console.warn) console.warn('[dsh] step failed:', err);
      }
    });

    // 最后再加一次保险：确保 .js 类存在时不会永久隐藏内容
    root.classList.add('js-ready');
  });
})();
