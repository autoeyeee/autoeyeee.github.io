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
     5. 满屏条幅：量出「元素到视口左右边」的真实距离
     ------------------------------------------------------------------
     为什么不用 calc(50% - 50vw)：那是相对「最近的容器」算的，而有侧边栏时
     正文列并不在视口正中，算出来左右会不对称。这里直接量 getBoundingClientRect。
     ------------------------------------------------------------------ */
  function initBleed() {
    var els = [].slice.call(doc.querySelectorAll('.banner--bleed'));
    if (!els.length) return;

    var ticking = false;

    function measure() {
      ticking = false;
      var vw = doc.documentElement.clientWidth;
      els.forEach(function (el) {
        // 先归零，否则量到的是「已经外扩过」的位置，会越滚越宽
        el.style.marginLeft = '0px';
        el.style.marginRight = '0px';
        var r = el.getBoundingClientRect();
        el.style.setProperty('--bleed-l', r.left + 'px');
        el.style.setProperty('--bleed-r', Math.max(0, vw - r.right) + 'px');
      });
    }

    function request() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(measure);
      }
    }

    measure();
    window.addEventListener('resize', request, { passive: true });
    // 字体加载完、图片撑开高度后宽度可能还会变，再补一次
    window.addEventListener('load', request);
  }

  /* ------------------------------------------------------------------
     6. 背景模式标记
     ------------------------------------------------------------------
     主题输出 <script id="canvas_nest">（开了粒子）或 <div id="web_bg">（设了背景图）。
     现代浏览器 CSS 里用 :has() 就能选中，这里再给 <html> 打一对类名做兜底。
     ------------------------------------------------------------------ */
  function initBackgroundFlags() {
    root.classList.toggle('has-canvas', !!doc.getElementById('canvas_nest'));
    root.classList.toggle('has-bg-image', !!doc.getElementById('web_bg'));
  }

  /* ------------------------------------------------------------------
     7. 首次访问提示：「设置」在右下角
     ------------------------------------------------------------------
     只显示一次（localStorage 记），8 秒自动消失，点一下也算已读。
     不想要这个提示：把下面的 SHOW_HINT 改成 false 即可。
     ------------------------------------------------------------------ */
  var SHOW_HINT = true;
  var HINT_KEY = 'dsh-hint-v1';

  function initHint() {
    if (!SHOW_HINT) return;
    if (!doc.getElementById('rightside-config')) return;

    var seen = null;
    try {
      seen = window.localStorage.getItem(HINT_KEY);
    } catch (err) {
      return; // 隐私模式下 localStorage 会抛错，直接不显示
    }
    if (seen) return;

    var hint = doc.createElement('div');
    hint.id = 'dsh-hint';
    hint.setAttribute('role', 'status');
    hint.textContent = '点右下角「设置」可以切换夜间模式 / 阅读模式';
    doc.body.appendChild(hint);

    // 一显示就记「已读」——否则用户没点也没等满 8 秒就离开的话，下次刷新还会再弹
    try {
      window.localStorage.setItem(HINT_KEY, '1');
    } catch (err) { /* 忽略 */ }

    var removed = false;

    function dismiss() {
      if (removed) return;
      removed = true;
      hint.classList.add('is-hiding');
      window.setTimeout(function () {
        if (hint.parentNode) hint.parentNode.removeChild(hint);
      }, 400);
    }

    hint.addEventListener('click', dismiss);
    window.setTimeout(dismiss, 8000);
  }

  /* ------------------------------------------------------------------
     8. 滚动相册
     ------------------------------------------------------------------
     作者只写 <div class="gallery-scroll"> 加若干 <img>，这里负责生成
       .gs-viewport（滚动 / 裁剪容器）
         .gs-track（横向排布的轨道）
           .gs-item（每张卡）
     以及左右箭头、鼠标拖拽，跑马灯模式还会克隆一份做无缝循环。

     ⚠️ 主题的 photofigcaption 会把 <img> 包进 <a>，并在后面补一个 .img-alt 图注，
     所以「一项」可能是 <a> 而不是 <img>，图注必须跟着挂进同一张卡里。
     ------------------------------------------------------------------ */
  function makeNav(cls, label) {
    var b = doc.createElement('button');
    b.type = 'button';
    b.className = 'gs-nav ' + cls;
    b.setAttribute('aria-label', label);
    b.innerHTML = '<i class="fas fa-chevron-' + (cls === 'gs-prev' ? 'left' : 'right') + '"></i>';
    return b;
  }

  function initGalleryScroll() {
    var boxes = [].slice.call(doc.querySelectorAll('.gallery-scroll'));
    if (!boxes.length) return;

    boxes.forEach(function (box) {
      if (box.querySelector('.gs-viewport')) return; // 幂等：重复调用不会重复包一层

      var children = [].slice.call(box.children);
      if (!children.length) return;

      // ---- 1) 把孩子整理成「一项一卡」----
      var track = doc.createElement('div');
      track.className = 'gs-track';

      var lastItem = null;
      children.forEach(function (node) {
        if (node.classList && node.classList.contains('img-alt')) {
          if (lastItem) lastItem.appendChild(node);
          return;
        }
        var item = doc.createElement('div');
        item.className = 'gs-item';
        item.appendChild(node);
        track.appendChild(item);
        lastItem = item;
      });

      var viewport = doc.createElement('div');
      viewport.className = 'gs-viewport';
      viewport.appendChild(track);
      box.appendChild(viewport);

      if (box.classList.contains('gallery-scroll--marquee')) {
        // ---- 2) 跑马灯：克隆一份接在后面实现无缝循环 ----
        var originals = [].slice.call(track.children);
        originals.forEach(function (it) {
          var clone = it.cloneNode(true);
          clone.setAttribute('aria-hidden', 'true');
          track.appendChild(clone);
        });

        var speed = parseFloat(getComputedStyle(box).getPropertyValue('--gs-speed')) || 6;
        track.style.setProperty('--gs-duration', (originals.length * speed) + 's');
        track.classList.add('is-running');
      } else {
        // ---- 3) 滑动模式：左右箭头 + 鼠标拖拽 ----
        var prev = makeNav('gs-prev', '上一张');
        var next = makeNav('gs-next', '下一张');
        box.appendChild(prev);
        box.appendChild(next);

        function step() {
          var first = track.firstElementChild;
          return first ? first.getBoundingClientRect().width + 14 : 280;
        }

        prev.addEventListener('click', function () {
          viewport.scrollBy({ left: -step(), behavior: 'smooth' });
        });
        next.addEventListener('click', function () {
          viewport.scrollBy({ left: step(), behavior: 'smooth' });
        });

        function syncNav() {
          var max = viewport.scrollWidth - viewport.clientWidth;
          prev.hidden = viewport.scrollLeft <= 4;
          next.hidden = viewport.scrollLeft >= max - 4;
        }

        viewport.addEventListener('scroll', function () {
          window.requestAnimationFrame(syncNav);
        }, { passive: true });
        window.addEventListener('resize', syncNav, { passive: true });
        syncNav();

        // 鼠标拖拽（触屏走系统原生滚动，不用插手）
        var down = false, startX = 0, startLeft = 0, moved = false;
        viewport.addEventListener('pointerdown', function (e) {
          if (e.pointerType !== 'mouse') return;
          down = true;
          moved = false;
          startX = e.clientX;
          startLeft = viewport.scrollLeft;
          viewport.style.scrollBehavior = 'auto';
        });
        viewport.addEventListener('pointermove', function (e) {
          if (!down) return;
          var dx = e.clientX - startX;
          if (Math.abs(dx) > 4) moved = true;
          viewport.scrollLeft = startLeft - dx;
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
          viewport.addEventListener(ev, function () {
            if (!down) return;
            down = false;
            viewport.style.scrollBehavior = '';
          });
        });
        // 拖完松手时别顺带触发图片的 fancybox 预览
        viewport.addEventListener('click', function (e) {
          if (!moved) return;
          moved = false;
          e.preventDefault();
          e.stopPropagation();
        }, true);
      }

      box.classList.add('is-ready');
    });
  }

  /* ------------------------------------------------------------------
     9. 正文图片懒加载
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
    [
      initBackgroundFlags,
      initProgress,
      initTables,
      initNav,
      initBleed,
      initGalleryScroll,
      initLazyImages,
      initReveal,
      initHint
    ].forEach(function (step) {
      try {
        step();
      } catch (err) {
        // 静默失败：动效不是必需品，内容可见才是
        if (window.console && console.warn) console.warn('[dsh] step failed:', err);
      }
    });

    // 主题的 photofigcaption 是在 DOMContentLoaded 里跑的，可能比这里晚一点点；
    // 相册整理是幂等的，load 时再补一次，保证每张卡都拿到了自己的图注
    window.addEventListener('load', function () {
      try {
        initGalleryScroll();
      } catch (err) { /* 忽略 */ }
    });

    // 最后再加一次保险：确保 .js 类存在时不会永久隐藏内容
    root.classList.add('js-ready');
  });
})();
