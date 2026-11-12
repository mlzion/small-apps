/* Three visible interpolation points, no tangent handles; DOM hit targets over canvas. */
"use strict";
class VelocityEditor {
  constructor(container, onCurve) {
    this.container = container;
    this.canvas = container.querySelector("canvas");
    this.context = this.canvas.getContext("2d");
    this.handles = [...container.querySelectorAll(".velocity-point")];
    this.onCurve = onCurve;
    this.cache = new Map();
    this.points = [
      { x: 0, y: 100 },
      { x: 0.5, y: 100 },
      { x: 1, y: 100 },
    ];
    this.drag = null;
    this.handles.forEach((handle, index) => {
      handle.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || handle.disabled || this.drag) return;
        e.preventDefault();
        this.drag = { index, pointer: e.pointerId };
        handle.setPointerCapture(e.pointerId);
      });
      handle.addEventListener("pointermove", (e) => {
        if (!this.drag || this.drag.pointer !== e.pointerId) return;
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect(),
          box = this.plot();
        const x = (e.clientX - rect.left - box.left) / box.width;
        const y = 127 - ((e.clientY - rect.top - box.top) / box.height) * 126;
        this.move(index, x, y);
      });
      const end = (e) => {
        if (this.drag?.pointer === e.pointerId) {
          this.drag = null;
          if (handle.hasPointerCapture(e.pointerId))
            handle.releasePointerCapture(e.pointerId);
        }
      };
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) =>
        handle.addEventListener(type, end),
      );
      handle.addEventListener("keydown", (e) => {
        if (
          ![
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "Home",
            "End",
          ].includes(e.key)
        )
          return;
        e.preventDefault();
        const point = this.points[index],
          amount = e.shiftKey ? 10 : 1;
        let x = point.x,
          y = point.y;
        if (e.key === "ArrowUp") y += amount;
        if (e.key === "ArrowDown") y -= amount;
        if (e.key === "ArrowLeft" && index === 1) x -= 0.01 * amount;
        if (e.key === "ArrowRight" && index === 1) x += 0.01 * amount;
        if (e.key === "Home") y = 1;
        if (e.key === "End") y = 127;
        this.move(index, x, y);
      });
    });
    // Touch gestures on the graph stay local; other page areas still scroll normally.
    container.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  fingerprint() {
    return (
      this.pattern.bars +
      ":" +
      this.pattern.notes
        .filter((n) => n.drum === this.drum)
        .map((n) => n.step + "," + n.velocity)
        .join(";")
    );
  }
  setData(pattern, drum) {
    this.drag = null;
    this.pattern = pattern;
    this.drum = drum;
    this.key = pattern.id + ":" + drum;
    const notes = pattern.notes
      .filter((n) => n.drum === drum && n.step < pattern.bars * 64)
      .sort((a, b) => a.step - b.step);
    this.enabled = notes.length > 0;
    const cached = this.cache.get(this.key);
    if (cached?.fingerprint === this.fingerprint())
      this.points = cached.points.map((p) => ({ ...p }));
    else {
      const middle = notes.reduce(
        (best, n) =>
          !best ||
          Math.abs(n.step - pattern.bars * 32) <
            Math.abs(best.step - pattern.bars * 32)
            ? n
            : best,
        null,
      );
      this.points = [
        { x: 0, y: notes[0]?.velocity || 100 },
        { x: 0.5, y: middle?.velocity || 100 },
        { x: 1, y: notes.at(-1)?.velocity || 100 },
      ];
    }
    this.handles.forEach((h) => {
      h.disabled = !this.enabled;
      h.hidden = !this.enabled;
    });
    this.updateHandles();
  }
  clearCache() {
    this.cache.clear();
  }
  plot() {
    const r = this.canvas.getBoundingClientRect();
    return {
      left: 38,
      top: 28,
      width: Math.max(1, r.width - 64),
      height: Math.max(1, r.height - 66),
    };
  }
  move(index, x, y) {
    if (!this.enabled) return;
    const spacing = Math.min(0.3, Math.max(0.08, 44 / this.plot().width));
    this.points[index] = {
      x:
        index === 1
          ? Math.max(spacing, Math.min(1 - spacing, x))
          : index === 0
            ? 0
            : 1,
      y: Math.round(Math.max(1, Math.min(127, y))),
    };
    this.onCurve(this.points);
    this.cache.set(this.key, {
      points: this.points.map((p) => ({ ...p })),
      fingerprint: this.fingerprint(),
    });
    this.updateHandles();
  }
  updateHandles() {
    const box = this.plot();
    this.handles.forEach((handle, i) => {
      const point = this.points[i];
      handle.style.left = box.left + point.x * box.width + "px";
      handle.style.top = box.top + ((127 - point.y) / 126) * box.height + "px";
      handle.setAttribute("aria-valuenow", point.y);
      handle.setAttribute(
        "aria-valuetext",
        `${point.y}${i === 1 ? `, at ${Math.round(point.x * 100)} percent of pattern` : ""}`,
      );
      handle.title = `${["Start", "Middle", "End"][i]}: ${point.y}${i === 1 ? " · " + Math.round(point.x * 100) + "%" : ""}`;
    });
    document.getElementById("velocity-values").textContent = this.enabled
      ? this.points.map((p) => p.y).join(" → ")
      : "No active hits";
  }
  draw(position, playing) {
    if (!this.pattern) return;
    const rect = this.canvas.getBoundingClientRect(),
      ratio = window.devicePixelRatio || 1,
      w = rect.width,
      h = rect.height;
    if (
      this.canvas.width !== Math.round(w * ratio) ||
      this.canvas.height !== Math.round(h * ratio)
    ) {
      this.canvas.width = Math.round(w * ratio);
      this.canvas.height = Math.round(h * ratio);
      this.updateHandles();
    }
    const ctx = this.context,
      box = this.plot(),
      total = this.pattern.bars * 64;
    const px = (x) => box.left + x * box.width,
      py = (y) => box.top + ((127 - y) / 126) * box.height;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = "11px system-ui";
    ctx.textAlign = "right";
    for (const velocity of [1, 32, 64, 96, 127]) {
      ctx.fillStyle = "#a9b5c7";
      ctx.fillText(velocity, box.left - 8, py(velocity) + 4);
      ctx.strokeStyle = "#344252";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px(0), py(velocity));
      ctx.lineTo(px(1), py(velocity));
      ctx.stroke();
    }
    // Faint 64ths, stronger eighths and bar boundaries. At narrow widths only
    // eighth lines are drawn; note dots always retain exact 64th positions.
    for (let step = 0; step <= total; step++) {
      if (step % 8 && box.width / total < 2) continue;
      ctx.strokeStyle =
        step % 64 === 0 ? "#6b7b90" : step % 8 === 0 ? "#344252" : "#202a36";
      ctx.beginPath();
      ctx.moveTo(px(step / total), py(127));
      ctx.lineTo(px(step / total), py(1));
      ctx.stroke();
      if (step % 64 === 0) {
        ctx.fillStyle = "#b5c2d4";
        ctx.textAlign = step === total ? "right" : "left";
        ctx.fillText(
          step === total ? "End" : `Bar ${step / 64 + 1}`,
          px(step / total),
          h - 12,
        );
      }
    }
    const notes = this.pattern.notes.filter(
      (n) => n.drum === this.drum && n.step < total,
    );
    for (const n of notes) {
      const x = px(n.step / total),
        y = py(n.velocity);
      ctx.strokeStyle = "#428bc580";
      ctx.beginPath();
      ctx.moveTo(x, py(1));
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = "#35bfff";
      ctx.beginPath();
      ctx.arc(x, y, 3.3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.enabled) {
      ctx.strokeStyle = "#90dfff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const x = i / 200,
          y = py(DruMidi.velocityAtCurve(this.points, x));
        if (i === 0) ctx.moveTo(px(x), y);
        else ctx.lineTo(px(x), y);
      }
      ctx.stroke();
    }
    if (playing) {
      const x = px(position / total);
      ctx.strokeStyle = "#ff777e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, py(127));
      ctx.lineTo(x, py(1));
      ctx.stroke();
    }
  }
}
window.VelocityEditor = VelocityEditor;
