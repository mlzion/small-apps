"use strict";
// Start the same game controller after the JSON request settles. A failed load
// is retained by the loader and shown by the game's configuration-error screen.
const controllerURL = new URL(
  "game.js?v=shuffle4",
  document.currentScript.src,
).href;
DFuzeLevels.loadPublished()
  .catch(() => {})
  .then(() => {
    const script = document.createElement("script");
    script.src = controllerURL;
    document.body.append(script);
  });
