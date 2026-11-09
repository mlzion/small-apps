"use strict";
class InputManager {
  constructor(game, audio, onPause, sync) {
    this.game = game;
    this.audio = audio;
    this.keys = new Set();
    this.pointers = new Map();
    this.buttons = [...document.querySelectorAll("[data-control]")];
    const mapping = {
      ArrowLeft: "ccw",
      a: "ccw",
      ArrowRight: "cw",
      d: "cw",
      " ": "fire",
    };
    window.addEventListener("keydown", (e) => {
      const action = mapping[e.key] || mapping[e.key.toLowerCase()];
      if (e.key === "Escape") {
        if (!e.repeat) onPause();
        return;
      }
      if (!action || game.state !== "PLAYING") return;
      e.preventDefault();
      audio.unlock();
      if (!this.keys.has(e.code)) {
        sync();
        this.keys.add(e.code);
        this.keys.add(action + ":" + e.code);
        if (action === "fire") game.fire();
      }
    });
    window.addEventListener("keyup", (e) => {
      sync();
      this.keys.delete(e.code);
      for (const action of ["fire", "ccw", "cw"])
        this.keys.delete(action + ":" + e.code);
    });
    for (const button of this.buttons) {
      button.addEventListener("pointerdown", (e) => {
        if (game.state !== "PLAYING") return;
        e.preventDefault();
        audio.unlock();
        sync();
        button.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, button.dataset.control);
        button.classList.add("held");
        if (button.dataset.control === "fire") game.fire();
      });
      const release = (e) => {
        sync();
        this.pointers.delete(e.pointerId);
        button.classList.toggle(
          "held",
          [...this.pointers.values()].includes(button.dataset.control),
        );
      };
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
        button.addEventListener(event, release);
      button.addEventListener("contextmenu", (e) => e.preventDefault());
    }
  }
  get held() {
    const active = (action) =>
      [...this.pointers.values()].includes(action) ||
      [...this.keys].some((k) => k.startsWith(action + ":"));
    return { ccw: active("ccw"), cw: active("cw"), fire: active("fire") };
  }
  clear() {
    this.keys.clear();
    this.pointers.clear();
    this.buttons.forEach((b) => b.classList.remove("held"));
  }
}
