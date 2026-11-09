"use strict";
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }
  draw(g) {
    const c = this.canvas,
      box = c.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 3),
      size = Math.round(box.width * dpr);
    if (c.width !== size || c.height !== size) {
      c.width = size;
      c.height = size;
    }
    const x = this.ctx;
    x.setTransform(size / 600, 0, 0, size / 600, 0, 0);
    x.clearRect(0, 0, 600, 600);
    x.save();
    x.translate(300, 300);
    const circle = (r, fill, stroke) => {
      x.beginPath();
      x.arc(0, 0, r, 0, Math.PI * 2);
      if (fill) {
        x.fillStyle = fill;
        x.fill();
      }
      if (stroke) {
        x.strokeStyle = stroke;
        x.lineWidth = 1;
        x.stroke();
      }
    };
    const geometry = DFuzeRings.GEOMETRY;
    circle(geometry.turretRadius, null, "#41474c");
    const urgency = 1 - g.remaining / g.config.time,
      pulse = Math.max(0, 1 - (g.elapsed - g.pulseAt) / 0.24),
      hit = Math.max(0, 1 - (g.elapsed - g.hitAt) / 0.12);
    const defusing = ["DEFUSING", "LEVEL_COMPLETE"].includes(g.state),
      exploding = ["EXPLODING", "LEVEL_FAILED", "GAME_OVER"].includes(g.state);
    const fade = defusing ? Math.min(1, g.effectTime) : 0;
    const light = 42 + urgency * 12 + pulse * (8 + urgency * 7) + hit * 12;
    for (const ring of g.rings) {
      const start = ring.displayAngle - ring.gateArc / 2;
      x.save();
      x.globalAlpha = defusing
        ? 1 - fade
        : exploding
          ? Math.max(0, 1 - g.effectTime / 1.3)
          : 1;
      x.lineWidth = ring.thickness;
      x.lineCap = "butt";
      x.strokeStyle = "#ef6258";
      x.beginPath();
      x.arc(0, 0, ring.radius, start + ring.gateArc, start + Math.PI * 2);
      x.stroke();
      if (ring.gate.health > 0) {
        const flash = Math.max(0, 1 - (g.elapsed - ring.gate.hitAt) / 0.15);
        x.globalAlpha *= ring.gate.opacity;
        x.strokeStyle = flash > 0 ? "#b5edff" : "#56adff";
        x.lineWidth = ring.thickness + flash * 3;
        x.beginPath();
        x.arc(0, 0, ring.radius, start, start + ring.gateArc);
        x.stroke();
      }
      x.restore();
    }
    circle(
      geometry.bombRadius,
      defusing
        ? `hsl(15 ${80 * (1 - fade)}% ${light * (1 - fade) + 18 * fade}%)`
        : `hsl(${16 - urgency * 10} 85% ${Math.min(70, light)}%)`,
    );
    if (!exploding) {
      x.fillStyle = "#fff";
      x.font = "bold 56px ui-monospace, monospace";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(String(Math.ceil(g.remaining)), 0, -4);
      x.font = "11px ui-monospace, monospace";
      x.fillText(defusing ? "D::FUZED" : "SECONDS", 0, 36);
    }
    if (!exploding) {
      x.save();
      x.rotate(g.angle);
      x.translate(geometry.turretRadius, 0);
      x.fillStyle = "#76ed91";
      x.beginPath();
      x.moveTo(-19, 0);
      x.lineTo(14, -12);
      x.lineTo(14, 12);
      x.closePath();
      x.fill();
      if (g.elapsed - g.shotAt < 0.075 && g.state === "PLAYING") {
        x.fillStyle = "#edfff1";
        x.beginPath();
        x.moveTo(-20, -7);
        x.lineTo(-34, 0);
        x.lineTo(-20, 7);
        x.fill();
      }
      x.restore();
    }
    const shot = g.lastShot;
    if (
      shot?.point &&
      g.elapsed - shot.time + (defusing ? g.effectTime : 0) < 0.1 &&
      !exploding
    ) {
      x.save();
      x.globalAlpha = Math.max(
        0,
        1 - (g.elapsed - shot.time + (defusing ? g.effectTime : 0)) / 0.1,
      );
      x.strokeStyle =
        shot.kind === "gate"
          ? "#80d1ff"
          : shot.kind === "wall"
            ? "#ffad91"
            : "#c3ffd1";
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(
        Math.cos(shot.angle) * geometry.muzzleRadius,
        Math.sin(shot.angle) * geometry.muzzleRadius,
      );
      x.lineTo(shot.point.x, shot.point.y);
      x.stroke();
      x.fillStyle = x.strokeStyle;
      x.beginPath();
      x.arc(shot.point.x, shot.point.y, 5, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
    if (exploding && g.effectTime < 1.3) {
      const t = g.effectTime,
        p = t / 1.3;
      x.globalAlpha = Math.max(0, 1 - p);
      circle(92 + t * 170, null, "#ffad62");
      for (let i = 0; i < 14; i++) {
        const a = i * 2.399,
          r = 85 + t * (90 + (i % 4) * 30);
        x.fillStyle = i % 2 ? "#ff784a" : "#ffc37b";
        x.fillRect(
          Math.cos(a) * r,
          Math.sin(a) * r,
          5 * (1 - p) + 2,
          5 * (1 - p) + 2,
        );
      }
      const tx = Math.cos(g.angle) * geometry.turretRadius,
        ty = Math.sin(g.angle) * geometry.turretRadius;
      for (let i = 0; i < 5; i++) {
        x.fillStyle = "#76ed91";
        x.fillRect(
          tx + Math.cos(i * 1.7) * t * 65,
          ty + Math.sin(i * 1.7) * t * 65,
          7 * (1 - p),
          7 * (1 - p),
        );
      }
      if (t < 0.14) {
        x.globalAlpha = (1 - t / 0.14) * 0.8;
        circle(100 + t * 140, "#fff4d6");
      }
      x.globalAlpha = 1;
    }
    x.restore();
  }
}
