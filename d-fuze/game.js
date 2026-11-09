"use strict";
const audio = new ArcadeAudio();
const game = new DFuze.Game((event, value) => {
  if (event === "state") {
    if (value !== "PLAYING") {
      input?.clear();
      audio.stop();
    }
    renderUI();
  } else audio.play(event, value);
});
const renderer = new Renderer(document.querySelector("#canvas"));
let lastTime = performance.now(),
  input = null,
  howTo = false;
// Space is the primary constraint; coarse input keeps short desktop windows playable.
const phoneLandscape = matchMedia(
  "(orientation: landscape) and (max-height: 500px) and (max-width: 1000px) and (any-pointer: coarse)",
);
const orientationOverlay = document.querySelector("#orientation-overlay");
const gameSurface = document.querySelector(".game");
let orientationBlocked = false;
let focusBeforeRotation = null;
function syncOrientation() {
  const blocked = phoneLandscape.matches;
  if (blocked === orientationBlocked) return;
  orientationBlocked = blocked;
  lastTime = performance.now();
  input.clear();
  if (blocked) {
    // Do not advance held input here: rotating must never spend ammo or a life.
    game.pause();
    audio.stop();
    focusBeforeRotation = document.activeElement;
  }
  gameSurface.inert = blocked;
  orientationOverlay.hidden = !blocked;
  if (blocked) orientationOverlay.focus({ preventScroll: true });
  else if (focusBeforeRotation?.isConnected) {
    focusBeforeRotation.focus({ preventScroll: true });
  }
}
function advance(now = performance.now()) {
  // Also check at the frame/input boundary in case resize delivery is delayed.
  syncOrientation();
  if (orientationBlocked) {
    lastTime = now;
    return;
  }
  const dt = Math.max(0, (now - lastTime) / 1000);
  lastTime = now;
  game.update(dt, input?.held);
}
function pauseToggle() {
  syncOrientation();
  if (orientationBlocked) return;
  advance();
  if (game.state === "PLAYING") game.pause();
  else if (game.state === "PAUSED") {
    lastTime = performance.now();
    audio.unlock();
    game.resume();
  }
}
input = new InputManager(game, audio, pauseToggle, advance);
const overlay = document.querySelector("#overlay"),
  message = document.querySelector("#message"),
  detail = document.querySelector("#detail"),
  actions = document.querySelector("#actions");
function button(label, action) {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", () => {
    syncOrientation();
    if (orientationBlocked) return;
    audio.unlock();
    audio.play("click");
    input.clear();
    lastTime = performance.now();
    action();
    renderUI();
  });
  actions.append(b);
}
function renderUI() {
  document.querySelector("#pause").disabled = !["PLAYING", "PAUSED"].includes(
    game.state,
  );
  document.querySelector("#pause").textContent =
    game.state === "PAUSED" ? "RESUME" : "PAUSE";
  overlay.hidden = ["PLAYING", "DEFUSING", "EXPLODING"].includes(game.state);
  if (overlay.hidden) return;
  actions.replaceChildren();
  message.className = "";
  document.querySelector("#tagline").textContent = "CORE ARCADE / PHASE 1";
  switch (game.state) {
    case "MAIN_MENU":
      message.textContent = howTo ? "HOW TO PLAY" : "D::FUZE";
      detail.textContent = howTo
        ? "Hold ← / A or CCW to orbit counterclockwise; → / D or CW to orbit clockwise. Tap or hold SPACE / FIRE to shoot inward. Defuse before time or ammo runs out. Three lives. ESC pauses."
        : "Orbit. Fire. Beat the countdown.";
      button("PLAY", () => {
        howTo = false;
        game.newGame();
      });
      button(howTo ? "BACK" : "HOW TO PLAY", () => {
        howTo = !howTo;
      });
      {
        const a = document.createElement("a");
        a.href = "../#apps";
        a.textContent = "BACK TO APP LAB";
        actions.append(a);
      }
      break;
    case "PAUSED":
      message.textContent = "PAUSED";
      detail.textContent = "Countdown on hold. Ready when you are.";
      button("RESUME", () => game.resume());
      button("MAIN MENU", () => game.menu());
      break;
    case "LEVEL_COMPLETE":
      message.textContent = "BOMB D::FUZED!";
      message.className = "success";
      detail.textContent = `Level ${game.level} complete. ${game.lives} lives remaining.`;
      button("PLAY NEXT LEVEL", () => game.nextLevel());
      button("MAIN MENU", () => game.menu());
      break;
    case "LEVEL_FAILED":
      message.textContent = "BOMB ::XPLODED!";
      message.className = "failure";
      detail.textContent = `${game.lives} lives remaining. Try Level ${game.level} again.`;
      button("RETRY LEVEL", () => game.retry());
      button("MAIN MENU", () => game.menu());
      break;
    case "GAME_OVER":
      message.textContent = "GAME OVER";
      message.className = "failure";
      detail.textContent = `Highest level reached: ${game.level}`;
      button("NEW GAME", () => game.newGame());
      button("MAIN MENU", () => game.menu());
      break;
  }
}
function updateHUD() {
  for (const [id, value] of Object.entries({
    level: game.level,
    ammo: game.ammo,
    health: game.health,
  }))
    document.getElementById(id).textContent = value;
  const lives = document.querySelector("#lives");
  lives.textContent = Array.from({ length: 3 }, (_, i) =>
    i < game.lives ? "♥" : "♡",
  ).join(" ");
  lives.setAttribute("aria-label", `${game.lives} lives`);
}
function soundUI() {
  const b = document.querySelector("#sound");
  b.textContent = audio.muted ? "SOUND OFF" : "SOUND ON";
  b.setAttribute("aria-pressed", String(audio.muted));
}
document.querySelector("#sound").addEventListener("click", () => {
  audio.unlock();
  audio.toggle();
  soundUI();
});
document.querySelector("#pause").addEventListener("click", pauseToggle);
function focusLost() {
  advance();
  input.clear();
  game.pause();
  audio.stop();
}
window.addEventListener("blur", focusLost);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) focusLost();
  lastTime = performance.now();
});
function frame(now) {
  advance(now);
  updateHUD();
  renderer.draw(game);
  requestAnimationFrame(frame);
}
phoneLandscape.addEventListener("change", syncOrientation);
window.addEventListener("resize", syncOrientation);
syncOrientation();
renderUI();
soundUI();
updateHUD();
requestAnimationFrame(frame);
