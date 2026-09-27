// Small DOM effects shared by the screens: restartable bumps, bursts of
// sparks, number tweens, cards flying to the deck and a hover tilt.
// Everything is skipped (or shortened) when the player prefers reduced motion.

import { h, clamp, prefersReducedMotion } from './dom.js';

/** Restart a one-shot CSS animation class. */
export function bump(el, cls = 'bump') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Expanding ring and a spray of sparks at a screen point. */
export function burst(layer, x, y, color, { size = 140, sparks = 12 } = {}) {
  if (!layer || prefersReducedMotion()) return;
  const ring = h('div.fx-ring');
  ring.style.cssText = `left:${x}px;top:${y}px;--c:${color};--s:${size}px`;
  ring.addEventListener('animationend', () => ring.remove());
  layer.appendChild(ring);
  for (let i = 0; i < sparks; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = size * (0.3 + Math.random() * 0.45);
    const s = h('div.fx-spark');
    s.style.cssText = `left:${x}px;top:${y}px;--c:${color}`;
    layer.appendChild(s);
    const rot = `rotate(${a}rad)`;
    s.animate([
      { transform: `translate(-50%, -50%) ${rot} translateX(0) scaleX(1.6)`, opacity: 1 },
      { transform: `translate(-50%, -50%) ${rot} translateX(${d}px) scaleX(0.3)`, opacity: 0 },
    ], { duration: 360 + Math.random() * 260, easing: 'cubic-bezier(0.15, 0.8, 0.3, 1)' }).onfinish = () => s.remove();
  }
}

/** Count a number shown in `el` from `from` to `to`; fmt turns the value into HTML. */
export function tweenNumber(el, from, to, fmt = String, ms = 520) {
  if (!el) return;
  if (from === to || prefersReducedMotion()) { el.innerHTML = fmt(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    if (!el.isConnected) return;
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - (1 - k) ** 3;
    el.innerHTML = fmt(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * A copy of a card flies from `fromRect` into `target` (e.g. the deck button),
 * then the target bumps. `node` is a freshly built card element.
 */
export function flyCard(layer, node, fromRect, target, onLand) {
  const to = target?.getBoundingClientRect();
  if (!layer || !to || !fromRect?.width || prefersReducedMotion()) { onLand?.(); return; }
  const w = fromRect.width;
  node.classList.add('flying');
  node.style.setProperty('--cw', `${w}px`);
  layer.appendChild(node);
  const h0 = w * 1.4;
  const dx = to.left + to.width / 2 - (fromRect.left + w / 2);
  const dy = to.top + to.height / 2 - (fromRect.top + h0 / 2);
  const start = `translate(${fromRect.left}px, ${fromRect.top}px)`;
  node.animate([
    { transform: `${start} scale(1)`, opacity: 1, offset: 0 },
    { transform: `${start} translate(0, -${Math.round(h0 * 0.12)}px) scale(1.08) rotate(-3deg)`, opacity: 1, offset: 0.25 },
    { transform: `${start} translate(${dx}px, ${dy + h0 * 0.3}px) scale(0.12) rotate(14deg)`, opacity: 0.2, offset: 1 },
  ], { duration: 640, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' }).onfinish = () => {
    node.remove();
    bump(target, 'bump');
    onLand?.();
  };
}

/**
 * Cards outside the hand lean towards a resting mouse and catch a glare.
 * One delegated listener on the app root; the frame is tilted, not the card,
 * so it never fights with the card's own transform.
 */
export function installCardTilt(root) {
  if (!matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;
  let cur = null;
  const reset = () => {
    if (!cur) return;
    cur.classList.remove('tilting');
    cur.style.removeProperty('--rx');
    cur.style.removeProperty('--ry');
    cur = null;
  };
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || prefersReducedMotion()) return;
    const card = e.target.closest?.('.card.static, .card.pickable');
    if (card !== cur) reset();
    if (!card) return;
    cur = card;
    const r = card.getBoundingClientRect();
    const px = clamp((e.clientX - r.left) / r.width, 0, 1);
    const py = clamp((e.clientY - r.top) / r.height, 0, 1);
    card.classList.add('tilting');
    card.style.setProperty('--rx', `${((0.5 - py) * 14).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${((px - 0.5) * 16).toFixed(2)}deg`);
    card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
  }, { passive: true });
  root.addEventListener('pointerleave', reset);
  root.addEventListener('pointerdown', reset, true);
}
