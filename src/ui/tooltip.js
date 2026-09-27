// Tooltips for anything with `el._tip` (string or function returning HTML).
// Mouse: hover. Touch: tap toggles, tapping elsewhere closes.

import { h, clamp } from './dom.js';

export class Tooltips {
  constructor(root) {
    this.root = root;
    this.el = h('div.tooltip', { role: 'tooltip' });
    this.el.hidden = true;
    root.appendChild(this.el);
    this.anchor = null;
    this.pointerType = 'mouse';

    root.addEventListener('pointerdown', (e) => { this.pointerType = e.pointerType; }, true);
    root.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const t = findTip(e.target);
      if (t && t !== this.anchor) this.showFor(t);
    });
    root.addEventListener('pointerout', (e) => {
      if (e.pointerType !== 'mouse' || !this.anchor) return;
      const to = e.relatedTarget;
      if (!to || !this.anchor.contains(to)) this.hide();
    });
    // Hide tips whose anchor was removed (e.g. the screen changed under a resting mouse).
    setInterval(() => { if (this.anchor && !this.anchor.isConnected) this.hide(); }, 250);
    root.addEventListener('click', (e) => {
      if (this.pointerType === 'mouse') return;
      const t = findTip(e.target);
      if (t && !t.classList.contains('card')) {
        if (this.anchor === t) this.hide();
        else this.showFor(t);
      } else if (!e.target.closest('.tooltip')) this.hide();
    });
  }

  showFor(el) {
    const tip = typeof el._tip === 'function' ? el._tip() : el._tip;
    if (!tip) return;
    this.anchor = el;
    this.show(el.getBoundingClientRect(), tip);
  }

  /** Show at a rect (DOMRect-like). side: 'top' | 'right' | 'bottom' */
  show(rect, html, side = 'top') {
    this.el.innerHTML = html;
    this.el.hidden = false;
    const w = this.el.offsetWidth;
    const hgt = this.el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x;
    let y;
    if (side === 'right') {
      x = rect.right + 10;
      if (x + w > vw - 8) x = rect.left - w - 10;
      y = rect.top + rect.height / 2 - hgt / 2;
    } else {
      x = rect.left + rect.width / 2 - w / 2;
      y = side === 'bottom' ? rect.bottom + 10 : rect.top - hgt - 10;
      if (y < 8) y = rect.bottom + 10;
      if (y + hgt > vh - 8) y = rect.top - hgt - 10;
    }
    this.el.style.transform = `translate(${clamp(x, 8, vw - w - 8)}px, ${clamp(y, 8, vh - hgt - 8)}px)`;
  }

  hide() {
    this.anchor = null;
    this.el.hidden = true;
  }
}

function findTip(node) {
  while (node && node !== document.body) {
    if (node._tip) return node;
    node = node.parentNode;
  }
  return null;
}
