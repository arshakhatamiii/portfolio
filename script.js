// =========================================
// 1. Loader + Hero
//    desktop        → scroll-scrubbed video
//    touch phones   → one-time autoplay intro (light video)
//    reduced motion → still first frame (light video)
// =========================================
const heroTrack = document.querySelector('.hero-scroll-track');
const heroVideo = document.getElementById('heroVideo');
const heroStage = document.getElementById('heroStage');
const heroBadge = document.getElementById('heroBadge');
const heroBar = document.querySelector('.hero-overlay-bar');
const loader = document.getElementById('loader');
const loaderBar = document.getElementById('loaderBar');
const loaderPercent = document.getElementById('loaderPercent');
const bootLog = document.getElementById('bootLog');

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmallTouch = window.matchMedia('(pointer: coarse)').matches && window.innerWidth <= 768;
const isMobileIntro = isSmallTouch && !prefersReduced;
const staticHero = prefersReduced || isSmallTouch; // these use the light video

const STAGES = [
  { at: 0.00, text: '01 / SEALED' },
  { at: 0.25, text: '02 / UNLOCKING' },
  { at: 0.55, text: '03 / ENTERING THE SERVER' },
  { at: 0.88, text: '04 / ONLINE' }
];

// ---------- Loader ----------
const MIN_LOAD_MS = prefersReduced ? 1200 : 3200; // minimum time the loader stays visible

const BOOT_LINES = [
  { at: 0.00, text: 'starting ASP.NET Core' },
  { at: 0.25, text: 'connecting PostgreSQL' },
  { at: 0.50, text: 'warming Redis cache' },
  { at: 0.75, text: 'loading scene' }
];

const loadStart = performance.now();
const onLoaderOpen = [];   // functions to run after the loader has opened
let loaderReady = false;   // the hero video is ready to play
let loaderOpened = false;
let loaderShown = 0;
let bootShown = 0;

function finishLoader() { loaderReady = true; }

function renderLoader(p) {
  if (loaderBar) loaderBar.style.width = `${p * 100}%`;
  if (loaderPercent) loaderPercent.textContent = String(Math.round(p * 100)).padStart(3, '0');

  while (bootLog && bootShown < BOOT_LINES.length && p >= BOOT_LINES[bootShown].at) {
    const prev = bootLog.lastElementChild;
    if (prev) prev.classList.add('ok');
    const li = document.createElement('li');
    li.textContent = BOOT_LINES[bootShown].text;
    bootLog.appendChild(li);
    bootShown++;
  }
}

function openLoader() {
  if (loaderOpened) return;
  loaderOpened = true;
  renderLoader(1);
  const last = bootLog && bootLog.lastElementChild;
  if (last) last.classList.add('ok');

  setTimeout(() => {               // a short beat on 100%
    if (loader) {
      loader.classList.add('opening');
      loader.classList.add('hidden');
    }
    document.body.classList.remove('is-loading');
    if (typeof window.updateScrollTarget === 'function') window.updateScrollTarget();
    onLoaderOpen.forEach((fn) => fn());
  }, 350);
}

function loaderLoop(now) {
  if (loaderOpened) return;
  const t = Math.min(Math.max((now - loadStart) / MIN_LOAD_MS, 0), 1);
  const timed = 1 - Math.pow(1 - t, 2);                 // ease-out
  const target = Math.min(timed, loaderReady ? 1 : 0.92); // wait at 92% until the video is ready
  loaderShown += (target - loaderShown) * 0.12;
  if (loaderShown > 0.995) loaderShown = 1;
  renderLoader(loaderShown);

  if (loaderShown >= 1 && loaderReady && t >= 1) openLoader();
  else requestAnimationFrame(loaderLoop);
}
requestAnimationFrame(loaderLoop);

// ---------- Hero stages ----------
let lastStage = -1;
function setStage(index) {
  if (index === lastStage || !heroStage) return;
  lastStage = index;
  heroStage.classList.add('swap');
  setTimeout(() => {
    heroStage.textContent = STAGES[index].text;
    heroStage.classList.remove('swap');
  }, 150);
}

// ---------- Hero ----------
if (heroTrack && heroVideo) {
  const desktopSrc = heroVideo.dataset.desktop || 'hero-video.mp4';
  const mobileSrc = heroVideo.dataset.mobile || 'hero-mobile.mp4';

  heroVideo.src = staticHero ? mobileSrc : desktopSrc;

  // If the light video is missing, fall back to the full one once
  let triedFallback = false;
  heroVideo.addEventListener('error', () => {
    if (staticHero && !triedFallback) {
      triedFallback = true;
      heroVideo.src = desktopSrc;
    } else {
      finishLoader();
    }
  });

  heroVideo.addEventListener('loadedmetadata', () => {
    heroVideo.currentTime = 0.01;
  });

  if (staticHero) {
    // ---------- touch phones / reduced motion ----------
    heroTrack.classList.add(isMobileIntro ? 'is-intro' : 'is-static');
    if (heroBar) heroBar.style.display = 'none'; // shown again when the intro ends

    const startIntro = () => {
      if (!isMobileIntro) return;
      heroVideo.play().catch(() => {
        // autoplay blocked (e.g. Low Power Mode): the first tap starts it
        heroTrack.addEventListener('touchstart', () => heroVideo.play().catch(() => {}),
          { once: true, passive: true });
      });
    };

    onLoaderOpen.push(startIntro); // the intro starts only after the loader opens
    heroVideo.addEventListener('canplay', finishLoader, { once: true });
    setTimeout(finishLoader, 4000); // fallback

    if (isMobileIntro) {
      heroVideo.addEventListener('timeupdate', () => {
        if (!heroVideo.duration) return;
        const p = heroVideo.currentTime / heroVideo.duration;
        let idx = 0;
        STAGES.forEach((s, i) => { if (p >= s.at) idx = i; });
        setStage(idx);
      });
      heroVideo.addEventListener('ended', () => {
        setStage(STAGES.length - 1);
        if (heroBadge) heroBadge.textContent = '● Scroll Down ↓';
        if (heroBar) heroBar.style.display = '';
      });
    }
  } else {
    // ---------- desktop: scroll-scrubbed ----------
    let targetTime = 0;
    let currentTime = 0;
    let isSeeking = false;

    heroVideo.addEventListener('canplaythrough', finishLoader);
    setTimeout(finishLoader, 6000); // fallback
    heroVideo.addEventListener('seeked', () => { isSeeking = false; });

    window.updateScrollTarget = function () {
      const rect = heroTrack.getBoundingClientRect();
      const scrollableDistance = heroTrack.offsetHeight - window.innerHeight;
      const scrolled = Math.min(Math.max(-rect.top, 0), scrollableDistance);
      const progress = scrollableDistance > 0 ? scrolled / scrollableDistance : 0;

      if (heroVideo.duration) targetTime = progress * (heroVideo.duration - 0.05);

      let idx = 0;
      STAGES.forEach((s, i) => { if (progress >= s.at) idx = i; });
      setStage(idx);

      if (heroBar) heroBar.classList.toggle('is-done', progress >= 0.96);
    };

    window.addEventListener('scroll', window.updateScrollTarget, { passive: true });
    window.addEventListener('resize', window.updateScrollTarget);

    function smoothScrubLoop() {
      if (heroVideo.readyState >= 2) {
        currentTime += (targetTime - currentTime) * 0.18;
        if (!isSeeking && Math.abs(heroVideo.currentTime - currentTime) > 0.015) {
          isSeeking = true;
          heroVideo.currentTime = currentTime;
        }
      }
      requestAnimationFrame(smoothScrubLoop);
    }
    requestAnimationFrame(smoothScrubLoop);
  }
} else {
  finishLoader();
}

// =========================================
// 2. Scroll reveal
// =========================================
const revealElements = document.querySelectorAll('.glass-card, .section-title');

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, index) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('active');
      }, index * 80);
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

revealElements.forEach((el) => {
  el.classList.add('reveal');
  revealObserver.observe(el);
});

// =========================================
// 3. Footer signature plays only when visible
// =========================================
const footerVideo = document.getElementById('footerVideo');

if (footerVideo) {
  footerVideo.pause();
  footerVideo.currentTime = 0;

  const signatureObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        footerVideo.currentTime = 0;
        footerVideo.play().catch(() => {});
      } else {
        footerVideo.pause();
        footerVideo.currentTime = 0;
      }
    });
  }, { threshold: 0.6 });

  signatureObserver.observe(footerVideo);
}

// =========================================
// 4. Active nav link
// =========================================
const navLinks = document.querySelectorAll('nav a[href^="#"]');
const watched = ['about', 'skills', 'projects', 'now', 'contact']
  .map((id) => document.getElementById(id))
  .filter(Boolean);

const navObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      navLinks.forEach((a) =>
        a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`)
      );
    }
  });
}, { rootMargin: '-40% 0px -50% 0px' });

watched.forEach((s) => navObserver.observe(s));

// =========================================
// 5. Hamburger menu
// =========================================
const menuToggle = document.getElementById('menuToggle');
const sideMenu = document.getElementById('sideMenu');
const menuOverlay = document.getElementById('menuOverlay');

function setMenu(open) {
  document.body.classList.toggle('menu-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  sideMenu.setAttribute('aria-hidden', String(!open));
}

if (menuToggle && sideMenu && menuOverlay) {
  menuToggle.addEventListener('click', () => {
    setMenu(!document.body.classList.contains('menu-open'));
  });
  menuOverlay.addEventListener('click', () => setMenu(false));
  sideMenu.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => setMenu(false));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false);
  });
}

// =========================================
// 6. 3D layer: tilt, parallax, floor, video pause
// =========================================
const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// Card tilt (desktop only, skipped with reduced motion)
if (canHover && !prefersReduced) {
  document.querySelectorAll('.glass-card').forEach((card) => {
    const max = (card.classList.contains('contact-card') || card.closest('#about')) ? 4 : 8;

    card.addEventListener('mouseenter', () => card.classList.add('is-tilting'));

    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty(
        '--tilt',
        `perspective(900px) rotateX(${(0.5 - y) * max * 2}deg) rotateY(${(x - 0.5) * max * 2}deg)`
      );
      card.style.setProperty('--mx', `${x * 100}%`);
      card.style.setProperty('--my', `${y * 100}%`);
    });

    card.addEventListener('mouseleave', () => {
      card.classList.remove('is-tilting');
      card.style.removeProperty('--tilt');
    });
  });
}

// Mouse parallax: hero video + floating objects
if (canHover && !prefersReduced) {
  let mx = 0, my = 0, sx = 0, sy = 0;
  const floaters = document.querySelectorAll('[data-depth]');

  window.addEventListener('mousemove', (e) => {
    mx = e.clientX / window.innerWidth - 0.5;
    my = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  const parallaxLoop = () => {
    sx += (mx - sx) * 0.08;
    sy += (my - sy) * 0.08;

    if (heroVideo) {
      heroVideo.style.transform = `translate3d(${-sx * 22}px, ${-sy * 14}px, 0) scale(1.06)`;
    }

    floaters.forEach((el) => {
      if (!el.isConnected) return;
      const d = parseFloat(el.dataset.depth) || 0.3;
      const box = el.parentElement.getBoundingClientRect();
      const off = box.top + box.height / 2 - window.innerHeight / 2;
       el.style.transform =
        `perspective(900px) translate3d(${sx * d * 36}px, ${-off * d * 0.08 + sy * d * 24}px, 0) ` +
        `rotateY(${sx * d * 14}deg) rotateX(${-sy * d * 14}deg)`;
    });

    requestAnimationFrame(parallaxLoop);
  };
  requestAnimationFrame(parallaxLoop);
}

// Floor grid moves with scroll
const bgFloor = document.getElementById('bgFloor');
if (bgFloor && !prefersReduced) {
  window.addEventListener('scroll', () => {
    bgFloor.style.backgroundPosition = `0 ${window.scrollY * 0.35}px`;
  }, { passive: true });
}

// Loop videos play only while visible
const loopVideos = document.querySelectorAll('.project-media video, .contact-bg video');
if (loopVideos.length) {
  const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.play().catch(() => {});
      else entry.target.pause();
    });
  }, { threshold: 0.2 });
  loopVideos.forEach((v) => videoObserver.observe(v));
}

// =========================================
// 7. Section numbers: static frame + floating digit
// =========================================
document.querySelectorAll('main .section-title').forEach((title, i) => {
  const frame = document.createElement('span');
  frame.className = 'sec-num';
  frame.setAttribute('aria-hidden', 'true');

  const digit = document.createElement('span');
  digit.textContent = String(i + 1).padStart(2, '0');
  digit.style.animationDelay = `${-i * 0.7}s`; // هر عدد با تاخیر متفاوت حرکت می‌کنه

  frame.appendChild(digit);
  title.prepend(frame);
});

// =========================================
// 8. Animated project icons (SMIL)
// =========================================
const animIcons = document.querySelectorAll('.anim-icon');

if (prefersReduced) {
  animIcons.forEach((svg) => {
    svg.setCurrentTime(3.5);
    svg.pauseAnimations();
  });
} else if (animIcons.length) {
  const iconObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.unpauseAnimations();
      else entry.target.pauseAnimations();
    });
  }, { threshold: 0 });
  animIcons.forEach((svg) => iconObserver.observe(svg));
}