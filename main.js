const dialog = document.querySelector('.case-dialog');
const dialogContent = dialog.querySelector('.dialog-content');
let returnFocus;
let caseHash;
let internalNavigation = false;

function openCase(hash, trigger) {
  const template = document.getElementById(hash.slice(1));
  if (!(template instanceof HTMLTemplateElement) || !hash.startsWith('#case-')) return;
  dialogContent.replaceChildren(template.content.cloneNode(true));
  returnFocus = trigger;
  caseHash = hash;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-case]');
  if (link && !event.defaultPrevented && event.button === 0 &&
      !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    internalNavigation = true;
    history.pushState({ portfolioCase: true }, '', link.hash);
    openCase(link.hash, link);
  }

  const toggle = event.target.closest('button[data-show]');
  if (toggle) {
    const evidence = toggle.closest('[data-evidence]');
    for (const button of evidence.querySelectorAll('button[data-show]')) {
      button.setAttribute('aria-pressed', String(button === toggle));
    }
    for (const panel of evidence.querySelectorAll('[data-evidence-panel]')) {
      panel.hidden = panel.dataset.evidencePanel !== toggle.dataset.show;
    }
  }
});

dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener('close', () => {
  dialogContent.querySelector('video')?.pause();
  if (location.hash === caseHash) {
    if (internalNavigation && history.state?.portfolioCase) {
      history.back();
    } else {
      const project = document.getElementById(caseHash.replace('#case-', ''));
      history.replaceState(null, '', '#' + project.id);
      project.scrollIntoView({ behavior: 'instant' });
    }
  }
  returnFocus?.focus({ preventScroll: true });
  internalNavigation = false;
});

function syncCase() {
  if (location.hash.startsWith('#case-')) {
    internalNavigation = Boolean(history.state?.portfolioCase);
    openCase(location.hash, returnFocus);
  } else if (dialog.open) {
    dialog.close();
  }
}

addEventListener('hashchange', syncCase);
syncCase();

const hero = document.querySelector('.hero');
const scene = document.querySelector('.hero-scene');
const field = document.querySelector('.light-field');
const canvas = field.querySelector('canvas');
const pauseLight = document.querySelector('.light-toggle');
const cover = document.querySelector('.feature-art');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');
const mobile = matchMedia('(max-width: 680px)');
const capture = new URLSearchParams(location.search).has('capture-light');
let light;
let visible = true;
let frame = 0;
let lastDraw = 0;
let paused = false;
let lightPointer = null;
let pointerX = 0;
let pointerY = 0;
let easedX = 0;
let easedY = 0;
const clamp = (number) => Math.max(0, Math.min(1, number));
const smooth = (number) => number * number * (3 - 2 * number);
const screenProperties = ['--copy-offset', '--screen-x', '--screen-y', '--screen-rx',
  '--screen-ry', '--screen-rz', '--screen-scale', '--reflection'];

function animate(timestamp) {
  frame = 0;
  if (motion.matches) {
    for (const property of screenProperties) scene.style.removeProperty(property);
    cover.style.removeProperty('--cover-scale');
    field.classList.remove('active');
    return;
  }

  const bounds = hero.getBoundingClientRect();
  if (bounds.bottom > 0 && bounds.top < innerHeight) {
    const progress = smooth(clamp((Math.max(0, scrollY) - 18) / (bounds.height * .54)));
    const small = mobile.matches;
    easedX += (pointerX - easedX) * .11;
    easedY += (pointerY - easedY) * .11;
    scene.style.setProperty('--copy-offset', (-progress * 38).toFixed(2) + 'px');
    scene.style.setProperty('--screen-x', (-progress * 38).toFixed(2) + 'px');
    scene.style.setProperty('--screen-y', (progress * 47).toFixed(2) + 'px');
    scene.style.setProperty('--screen-rx', ((small ? 4 : 5) * (1-progress) - easedY * 2.2).toFixed(2) + 'deg');
    scene.style.setProperty('--screen-ry', ((small ? -9 : -15) * (1-progress) + easedX * 3.6).toFixed(2) + 'deg');
    scene.style.setProperty('--screen-rz', ((small ? -4 : -6) * (1-progress)).toFixed(2) + 'deg');
    scene.style.setProperty('--screen-scale', (1 + progress * (small ? .04 : .105)).toFixed(4));
    scene.style.setProperty('--reflection', String((Math.sin(progress * Math.PI) * .26) + Math.abs(easedX) * .1));
    if (light && (capture || paused || timestamp - lastDraw >= 30)) {
      const dt = lastDraw ? Math.min(.05, (timestamp - lastDraw) / 1000) : 0;
      const rendered = light.draw(dt, progress, lightPointer, paused);
      field.classList.toggle('active', rendered);
      if (!rendered) {
        light.dispose();
        light = null;
        pauseLight.hidden = true;
      }
      lastDraw = timestamp;
    }
  }
  const artwork = cover.getBoundingClientRect();
  if (artwork.bottom > 0 && artwork.top < innerHeight) {
    const reveal = smooth(clamp((innerHeight - artwork.top) / Math.max(artwork.height, 1)));
    cover.style.setProperty('--cover-scale', (1.035 - .035 * reveal).toFixed(4));
  }
  if (light && visible && !document.hidden && !capture && !paused) queueFrame();
}

function queueFrame() {
  if (!frame) frame = requestAnimationFrame(animate);
}

function syncMotion() {
  if (!motion.matches && !light) light = window.createLight(canvas, capture);
  pauseLight.hidden = motion.matches || !light || capture;
  queueFrame();
}

pauseLight.addEventListener('click', () => {
  paused = !paused;
  pauseLight.setAttribute('aria-pressed', String(paused));
  pauseLight.title = paused ? 'Продолжить анимацию фона' : 'Приостановить анимацию фона';
  lastDraw = 0;
  queueFrame();
});

scene.addEventListener('pointermove', (event) => {
  if (coarse.matches || motion.matches || capture || event.pointerType === 'touch') return;
  const bounds = scene.getBoundingClientRect();
  pointerX = (event.clientX - bounds.left) / bounds.width * 2 - 1;
  pointerY = (event.clientY - bounds.top) / bounds.height * 2 - 1;
  const lightBounds = field.getBoundingClientRect();
  lightPointer = { x: event.clientX - lightBounds.left, y: event.clientY - lightBounds.top };
  queueFrame();
}, { passive: true });
scene.addEventListener('pointerleave', () => {
  pointerX = pointerY = 0;
  lightPointer = null;
  queueFrame();
});

new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  if (visible) queueFrame();
}).observe(scene);

canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  light = null;
  field.classList.remove('active');
  pauseLight.hidden = true;
});
canvas.addEventListener('webglcontextrestored', syncMotion);
motion.addEventListener('change', syncMotion);
document.addEventListener('visibilitychange', queueFrame);
addEventListener('scroll', queueFrame, { passive: true });
addEventListener('resize', queueFrame);
addEventListener('pagehide', (event) => {
  if (!event.persisted) light?.dispose();
});
syncMotion();
