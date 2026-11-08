'use strict';

// Keep the footer current; the gallery and every link also work without JavaScript.
document.querySelector('#year').textContent = String(new Date().getFullYear());
