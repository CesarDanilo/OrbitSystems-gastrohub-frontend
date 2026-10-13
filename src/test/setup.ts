import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

// jsdom has no <dialog> modal API. Minimal stand-in: open/close, the close event and Escape.
// Real browser behaviour (focus trap, top layer, backdrop) is covered by the E2E suite.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  const onEscape = function (this: HTMLDialogElement, e: KeyboardEvent) {
    if (e.key === 'Escape') this.close();
  };
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    this.addEventListener('keydown', onEscape);
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.removeEventListener('keydown', onEscape);
    this.dispatchEvent(new Event('close'));
  };
  Object.defineProperty(HTMLDialogElement.prototype, 'open', {
    get(this: HTMLDialogElement) {
      return this.hasAttribute('open');
    },
    configurable: true,
  });
}
