"use strict";
// One set of editing/playback controls; independent ring and assembly views.
window.DFuzeMotionEditor = {
  mount(api) {
    const $ = (id) => document.getElementById(id),
      A = DFuzeAssembly,
      M = DFuzeExperimentalMotion;
    let mode = "ring",
      ids = {
        ring: api.document().ringProfiles[0].id,
        assembly: api.document().assemblyProfiles[0].id,
      },
      time = 0,
      playing = false;
    const library = () =>
      mode === "ring"
        ? api.document().ringProfiles
        : api.document().assemblyProfiles;
    const current = () => library().find((p) => p.id === ids[mode]);
    const validate = (p, ring) =>
      ring ? M.validateEditable(p) : A.validateProfile(p);
    const sample = (p, t, ring) =>
      ring ? M.sampleProfile(M.compile(p), t) : A.sampleProfile(p, t);
    const holds = (p) => M.FAMILIES[p.difficulty].alignmentWindows;
    const protectedKey = (p, k) =>
      mode === "ring" &&
      (k[0] === 0 ||
        k[0] === 10 ||
        holds(p).some(([a, b]) => k[0] >= a && k[0] <= b));
    const editableGap = (p, i) =>
      i < p.keyframes.length - 1 &&
      (mode !== "ring" ||
        !holds(p).some(
          ([a, b]) =>
            (p.keyframes[i][0] + p.keyframes[i + 1][0]) / 2 >= a &&
            (p.keyframes[i][0] + p.keyframes[i + 1][0]) / 2 <= b,
        ));
    function options(select, profiles, value) {
      select.replaceChildren();
      for (const p of profiles) {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = (p.difficulty ? `${p.difficulty}: ` : "") + p.name;
        select.append(o);
      }
      select.value = value;
    }
    function stop() {
      playing = false;
      time = 0;
      $("motion-play").textContent = "PLAY";
      drawViews();
    }
    function changed() {
      stop();
      api.changed();
    }
    function render() {
      for (const type of ["ring", "assembly"]) {
        const list =
          type === "ring"
            ? api.document().ringProfiles
            : api.document().assemblyProfiles;
        if (!list.some((p) => p.id === ids[type])) ids[type] = list[0].id;
      }
      const p = current();
      $("motion-mode").value = mode;
      $("profiles-section").hidden = mode !== "ring";
      $("assembly-section").hidden = mode !== "assembly";
      options($("motion-profile"), library(), p.id);
      options(
        $("assembly-profile"),
        api.document().assemblyProfiles,
        api.level().assembly.profileId,
      );
      $("assembly-rate").value = api.level().assembly.playbackSpeed;
      $("motion-family").value = p.difficulty || "easy";
      $("motion-family-label").hidden = mode !== "ring";
      $("motion-name").value = p.name;
      $("motion-duration").value = p.duration;
      $("motion-duration").readOnly = mode === "ring";
      renderKeys();
      stop();
    }
    function renderKeys() {
      const p = current(),
        body = $("motion-keys");
      body.replaceChildren();
      p.keyframes.forEach((key, i) => {
        const locked = protectedKey(p, key),
          tr = document.createElement("tr");
        for (const j of [0, 1]) {
          const td = document.createElement("td"),
            input = document.createElement("input");
          if (j === 1) td.className = "angle-cell";
          input.type = j === 1 ? "text" : "number";
          input.inputMode = j === 1 ? "text" : "decimal";
          input.step = "any";
          input.value = key[j] ?? "";
          input.setAttribute(
            "aria-label",
            `Motion key ${i + 1} ${j === 0 ? "time" : "angle"}`,
          );
          input.readOnly = locked || (i === 0 && j === 0);
          input.addEventListener("change", () => {
            const text = input.value.trim();
            key[j] = /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)
              ? Number(text)
              : null;
            changed();
          });
          td.append(input);
          if (j === 1) {
            const flip = document.createElement("button");
            flip.textContent = "+/−";
            flip.setAttribute("aria-label", `Reverse sign key ${i + 1}`);
            flip.disabled = locked;
            flip.addEventListener("click", () => {
              if (!Number.isFinite(key[1])) {
                api.status(
                  "Enter a valid angle before reversing its sign.",
                  true,
                );
                return;
              }
              key[1] = key[1] === 0 ? 0 : -key[1];
              input.value = key[1];
              changed();
            });
            td.append(flip);
          }
          tr.append(td);
        }
        const td = document.createElement("td");
        if (mode === "ring") {
          const ease = document.createElement("select");
          ease.setAttribute("aria-label", `Motion key ${i + 1} easing`);
          for (const value of ["smooth", "linear"]) {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = value;
            ease.append(o);
          }
          ease.value = key[2];
          ease.disabled = locked;
          ease.addEventListener("change", () => {
            key[2] = ease.value;
            changed();
          });
          td.append(ease);
        }
        const insert = document.createElement("button");
        insert.textContent = "INSERT AFTER";
        insert.disabled = !editableGap(p, i);
        insert.addEventListener("click", () => insertKey(i));
        const remove = document.createElement("button");
        remove.textContent = "DELETE KEY";
        remove.disabled = locked || i === 0 || i === p.keyframes.length - 1;
        remove.addEventListener("click", () => {
          p.keyframes.splice(i, 1);
          renderKeys();
          changed();
        });
        td.append(insert, remove);
        tr.append(td);
        body.append(tr);
      });
    }
    function insertKey(i) {
      const p = current();
      if (p.keyframes.length >= 100) {
        api.status("Maximum 100 keys per profile.", true);
        return;
      }
      const a = p.keyframes[i],
        b = p.keyframes[i + 1],
        key = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (mode === "ring") key.push("smooth");
      p.keyframes.splice(i + 1, 0, key);
      renderKeys();
      changed();
    }
    function drawView(p, ring, t) {
      const graph = $(ring ? "profile-graph" : "assembly-graph"),
        ctx = graph.getContext("2d"),
        w = Math.max(260, Math.round(graph.getBoundingClientRect().width)),
        h = 210,
        dpr = Math.min(devicePixelRatio || 1, 3);
      graph.width = w * dpr;
      graph.height = h * dpr;
      graph.style.aspectRatio = `${w}/${h}`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const errors = validate(p, ring),
        readout = $(ring ? "profile-readout" : "assembly-readout");
      readout.textContent = errors.length
        ? errors.join(" ")
        : `${t.toFixed(2)}s / ${((sample(p, t, ring) * 180) / Math.PI).toFixed(1)}°`;
      const canvas = $(ring ? "profile-ring" : "assembly-animation"),
        x = canvas.getContext("2d");
      x.clearRect(0, 0, 240, 240);
      if (errors.length) return;
      const lo = Math.min(0, ...p.keyframes.map((k) => k[1])) - 10,
        hi = Math.max(0, ...p.keyframes.map((k) => k[1])) + 10,
        px = (t) => 50 + (t / p.duration) * (w - 64),
        py = (a) => 175 - ((a - lo) / (hi - lo)) * 150;
      if (ring)
        for (const [a, b] of holds(p)) {
          ctx.fillStyle = "#35614666";
          ctx.fillRect(px(a), 15, px(b) - px(a), 160);
        }
      ctx.strokeStyle = "#657181";
      ctx.beginPath();
      ctx.moveTo(50, 15);
      ctx.lineTo(50, 175);
      ctx.lineTo(w - 14, 175);
      ctx.stroke();
      ctx.fillStyle = "#d1d9e4";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      for (let i = 0; i <= 5; i++)
        ctx.fillText(
          `${((p.duration * i) / 5).toFixed(1)}s`,
          px((p.duration * i) / 5),
          198,
        );
      ctx.textAlign = "right";
      for (const a of [lo, 0, hi])
        ctx.fillText(`${a.toFixed(0)}°`, 46, py(a) + 4);
      ctx.strokeStyle = ring ? "#86bdff" : "#b6d68d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 800; i++) {
        const tt = (p.duration * i) / 800,
          y = py((sample(p, tt, ring) * 180) / Math.PI);
        i ? ctx.lineTo(px(tt), y) : ctx.moveTo(px(tt), y);
      }
      ctx.stroke();
      ctx.fillStyle = "#e2e7ed";
      for (const [tt, a] of p.keyframes) {
        ctx.beginPath();
        ctx.arc(px(tt), py(a), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "#f2be75";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px(t), 15);
      ctx.lineTo(px(t), 175);
      ctx.stroke();
      x.save();
      x.translate(120, 120);
      x.rotate(sample(p, t, ring));
      for (const r of ring ? [85] : [55, 85]) {
        x.lineWidth = 6;
        x.strokeStyle = "#ef6258";
        x.beginPath();
        x.arc(0, 0, r, -Math.PI / 2 + 0.4, Math.PI * 1.5 - 0.4);
        x.stroke();
        x.strokeStyle = "#56adff";
        x.beginPath();
        x.arc(0, 0, r, -Math.PI / 2 - 0.4, -Math.PI / 2 + 0.4);
        x.stroke();
      }
      x.restore();
    }
    function drawViews() {
      const ring = api.document().ringProfiles.find((p) => p.id === ids.ring),
        assembly = api
          .document()
          .assemblyProfiles.find((p) => p.id === ids.assembly);
      if (ring) drawView(ring, true, mode === "ring" ? time : 0);
      if (assembly) drawView(assembly, false, mode === "assembly" ? time : 0);
      $("profile-title").textContent = ring
        ? `${ring.name} · ${ring.difficulty} · 10s`
        : "";
      $("assembly-title").textContent = assembly
        ? `${assembly.name} · ${assembly.duration}s`
        : "";
    }
    $("motion-mode").addEventListener("change", () => {
      mode = $("motion-mode").value;
      render();
    });
    $("motion-profile").addEventListener("change", () => {
      ids[mode] = $("motion-profile").value;
      render();
    });
    $("motion-family").addEventListener("change", () => {
      ids.ring = api
        .document()
        .ringProfiles.find((p) => p.difficulty === $("motion-family").value).id;
      render();
    });
    $("motion-name").addEventListener("change", () => {
      current().name = $("motion-name").value;
      changed();
      options($("motion-profile"), library(), current().id);
    });
    $("motion-duration").addEventListener("change", () => {
      if (mode === "ring") return;
      current().duration = $("motion-duration").valueAsNumber;
      changed();
    });
    $("motion-add-key").addEventListener("click", () => {
      const p = current();
      let at = -1;
      for (let i = 0; i < p.keyframes.length - 1; i++)
        if (
          editableGap(p, i) &&
          (at < 0 ||
            p.keyframes[i + 1][0] - p.keyframes[i][0] >
              p.keyframes[at + 1][0] - p.keyframes[at][0])
        )
          at = i;
      if (at >= 0) insertKey(at);
    });
    function add(copy) {
      if (library().length >= 256) {
        api.status("Maximum 256 profiles per library.", true);
        return;
      }
      const p = copy
        ? JSON.parse(JSON.stringify(current()))
        : mode === "ring"
          ? M.defaults().find((p) => p.difficulty === $("motion-family").value)
          : {
              name: "New assembly motion",
              duration: 25,
              keyframes: [
                [0, 0],
                [25, 0],
              ],
            };
      p.id = `custom-${mode}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
      p.name = copy ? (p.name + " copy").slice(0, 80) : `New ${mode} profile`;
      library().push(p);
      ids[mode] = p.id;
      changed();
      render();
    }
    $("motion-duplicate").addEventListener("click", () => add(true));
    $("motion-new").addEventListener("click", () => add(false));
    $("motion-delete").addEventListener("click", () => {
      const p = current();
      if (
        mode === "ring" &&
        library().filter((q) => q.difficulty === p.difficulty).length === 1
      ) {
        api.status("Keep at least one profile in each ring family.", true);
        return;
      }
      if (
        mode === "assembly" &&
        api.document().levels.some((l) => l.assembly.profileId === p.id)
      ) {
        api.status(
          "Choose another assembly profile for referring levels before deleting.",
          true,
        );
        return;
      }
      const key = mode === "ring" ? "ringProfiles" : "assemblyProfiles";
      api.document()[key] = library().filter((q) => q.id !== p.id);
      ids[mode] = api.document()[key][0].id;
      changed();
      render();
    });
    $("assembly-profile").addEventListener("change", () => {
      api.level().assembly.profileId = $("assembly-profile").value;
      changed();
    });
    $("assembly-rate").addEventListener("change", () => {
      api.level().assembly.playbackSpeed = $("assembly-rate").valueAsNumber;
      changed();
    });
    $("motion-play").addEventListener("click", () => {
      if (playing) {
        stop();
        return;
      }
      if (validate(current(), mode === "ring").length) return;
      time = 0;
      playing = true;
      $("motion-play").textContent = "STOP";
      drawViews();
    });
    window.addEventListener("resize", drawViews);
    return {
      render,
      tick(dt) {
        if (playing) {
          time = (time + dt) % current().duration;
          drawViews();
        }
      },
      pause: stop,
      get time() {
        return time;
      },
      get playing() {
        return playing;
      },
    };
  },
};
