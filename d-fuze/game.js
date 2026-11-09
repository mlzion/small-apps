"use strict";
const audio = new ArcadeAudio();
const debugParams = new URLSearchParams(location.search);
const seedText = debugParams.get("seed");
const debugEnabled = debugParams.get("debug") === "1";
let experimentalLevel = null,
  experimentalProfiles = null,
  experimentalRings = null,
  experimentalNotes = [],
  testError = null;
if (debugParams.get("test") === "1") {
  try {
    const transfer = DFuzeSchema.readTestData(
      sessionStorage.getItem(DFuzeSchema.TEST_KEY),
    );
    experimentalLevel = transfer.level;
    experimentalProfiles = transfer.assemblyProfiles;
    experimentalRings = transfer.ringProfiles;
    experimentalNotes = transfer.migrationNotes || [];
  } catch (error) {
    testError = error.message;
  }
}
let loadError = null,
  game = null;
try {
  game = new DFuze.Game(
    (event, value) => {
      if (event === "state") {
        if (value !== "PLAYING") {
          input?.clear();
          audio.stop();
        }
        renderUI();
      } else audio.play(event, value);
    },
    undefined,
    experimentalLevel
      ? {
          seed: experimentalLevel.seed,
          testLevel: experimentalLevel,
          assemblyProfiles: experimentalProfiles,
          ringProfiles: experimentalRings,
        }
      : seedText !== null && Number.isFinite(Number(seedText))
        ? { seed: Number(seedText) }
        : {},
  );
} catch (error) {
  loadError = error.message;
}
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
  if (!game) return;
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
  if (!game) return;
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
input = game ? new InputManager(game, audio, pauseToggle, advance) : null;
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
function returnToEditor() {
  try {
    if (
      window.opener &&
      !window.opener.closed &&
      window.opener.location.origin === location.origin &&
      /\/d-fuze\/builder\/(?:index\.html)?$/.test(
        window.opener.location.pathname,
      )
    ) {
      window.opener.focus();
      window.close();
      return;
    }
  } catch {}
  location.href = "builder/";
}
function renderTestUI() {
  if (testError) {
    message.textContent = "TEST UNAVAILABLE";
    detail.textContent = testError;
    button("RETURN TO EDITOR", returnToEditor);
    return;
  }
  message.className = "";
  if (game.state === "MAIN_MENU") {
    message.textContent = `TEST LEVEL ${game.level}`;
    detail.textContent = `${game.testLevel.name || "Experimental level"} · Seed ${game.seed}. ${experimentalNotes.join(" ")}`;
    button("START TEST", () => game.newGame());
  } else if (game.state === "PAUSED") {
    message.textContent = "PAUSED";
    detail.textContent = "Experimental level on hold.";
    button("RESUME", () => game.resume());
  } else {
    const success = game.state === "LEVEL_COMPLETE";
    message.textContent = success ? "BOMB D::FUZED!" : "BOMB ::XPLODED!";
    message.className = success ? "success" : "failure";
    detail.textContent = `Test Level ${game.level} · Seed ${game.seed}. No level advancement.`;
    button("RETRY LEVEL", () => game.retry());
    button("RETRY WITH NEW SEED", () => {
      game.seed = Math.floor(Math.random() * 4294967296);
      game.retry();
    });
  }
  button("RETURN TO EDITOR", returnToEditor);
}
function renderUI() {
  if (loadError) {
    overlay.hidden = false;
    message.textContent = "CONFIGURATION ERROR";
    detail.textContent = loadError;
    actions.replaceChildren();
    const link = document.createElement("a");
    link.href = "../#apps";
    link.textContent = "BACK TO APP LAB";
    actions.append(link);
    document.querySelectorAll("button").forEach((b) => (b.disabled = true));
    return;
  }

  document.querySelector("#pause").disabled = !["PLAYING", "PAUSED"].includes(
    game.state,
  );
  document.querySelector("#pause").textContent =
    game.state === "PAUSED" ? "RESUME" : "PAUSE";
  overlay.hidden = ["PLAYING", "DEFUSING", "EXPLODING"].includes(game.state);
  if (overlay.hidden) return;
  actions.replaceChildren();
  message.className = "";
  document.querySelector("#tagline").textContent =
    game?.testMode || testError ? "EXPERIMENTAL TEST" : "D::FUZE / ARCADE";
  if (game?.testMode || testError) {
    renderTestUI();
    return;
  }
  switch (game.state) {
    case "MAIN_MENU":
      message.textContent = howTo ? "HOW TO PLAY" : "D::FUZE";
      detail.textContent = howTo
        ? "Hold ← / A or CCW to orbit counterclockwise; → / D or CW to orbit clockwise. Tap or hold SPACE / FIRE. Red walls block shots. Break the blue gate, then shoot through the moving opening to defuse the bomb. Three lives. ESC pauses."
        : "Break the blue gate. Track the opening. Defuse.";
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
      if (game.level < 6) button("PLAY NEXT LEVEL", () => game.nextLevel());
      else
        detail.textContent =
          "All 6 available levels complete! Three-ring gameplay is not available yet.";
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
  if (!game) return;
  for (const [id, value] of Object.entries({
    level: game.level,
    ammo: game.ammo,
    health: game.health,
    "gate-health": game.rings.reduce((sum, r) => sum + r.gate.health, 0),
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
  if (!game) return;
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
  if (!game) return;
  advance(now);
  updateHUD();
  renderer.draw(game);
  if (debugEnabled) {
    const panel = document.querySelector("#debug");
    panel.hidden = false;
    panel.textContent = JSON.stringify(
      {
        level: game.level,
        seed: game.seed,
        rings: game.rings.length,
        profile: game.rings.map((r) => r.profile.name),
        animationTime: +game.animationTime.toFixed(2),
        playback: game.config.animationPlaybackSpeed,
        gates: game.rings.map((r) => ({
          angle: +r.gate.angle.toFixed(3),
          health: r.gate.health,
        })),
        bomb: game.health,
        ammo: game.ammo,
      },
      null,
      2,
    );
  }
  requestAnimationFrame(frame);
}
phoneLandscape.addEventListener("change", syncOrientation);
window.addEventListener("resize", syncOrientation);
syncOrientation();
document.querySelector("#test-mode").hidden = !(game?.testMode || testError);
renderUI();
soundUI();
updateHUD();
requestAnimationFrame(frame);
