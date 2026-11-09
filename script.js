'use strict';

// Keep the footer current; the gallery and every link also work without JavaScript.
document.querySelector('#year').textContent = String(new Date().getFullYear());

// The builder asks for a disposable public access code before displaying tools.
document.querySelector('#developer-tools').addEventListener('click', () => {
  window.location.href = 'd-fuze/builder/';
});
