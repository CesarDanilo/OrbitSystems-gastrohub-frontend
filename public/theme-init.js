/* global document */
// Applies the saved theme before the first paint (no flash). Dark is the default.
// Kept as a same-origin file because the CSP does not allow inline scripts.
(function () {
  var theme = 'dark';
  try {
    if (localStorage.getItem('gastrohub-theme') === 'light') theme = 'light';
  } catch {
    // Storage blocked: keep the default.
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
