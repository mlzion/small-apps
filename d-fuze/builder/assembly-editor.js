"use strict";
window.DFuzeAssemblyEditor = {
  mount(api) {
    const $ = (id) => document.getElementById(id),
      A = DFuzeAssembly;
    let selected = "gentle-drift",
      time = 0,
      playing = false;
    const current = () =>
      api.document().assemblyProfiles.find((p) => p.id === selected);
    const setStatus = (e) => api.status(e, true);
    function change() {
      playing = false;
      $("assembly-play").textContent = "PLAY";
      api.changed();
    }
    function options(select, selectedId) {
      select.replaceChildren();
      for (const p of api.document().assemblyProfiles) {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = p.name;
        select.append(o);
      }
      select.value = selectedId;
    }
    function render() {
      const doc = api.document();
      if (!doc.assemblyProfiles.some((p) => p.id === selected))
        selected = doc.assemblyProfiles[0].id;
      const p = current();
      options($("assembly-edit-profile"), selected);
      options($("assembly-profile"), api.level().assembly.profileId);
      $("assembly-rate").value = api.level().assembly.playbackSpeed;
      $("assembly-name").value = p.name;
      $("assembly-duration").value = p.duration;
      $("assembly-delete-profile").disabled = p.id === "gentle-drift";
      $("assembly-time").max = p.duration;
      time = 0;
      playing = false;
      $("assembly-play").textContent = "PLAY";
      renderKeys();
      draw();
    }
    function renderKeys() {
      const p = current(),
        body = $("assembly-keys");
      body.replaceChildren();
      p.keyframes.forEach((key, i) => {
        const tr = document.createElement("tr");
        for (const [j, name] of [
          [0, "time"],
          [1, "angle"],
        ]) {
          const td = document.createElement("td"),
            input = document.createElement("input");
          input.type = "number";
          input.step = "any";
          input.value = key[j] ?? "";
          input.setAttribute("aria-label", `Assembly key ${i + 1} ${name}`);
          if (i === 0 && j === 0) input.readOnly = true;
          input.addEventListener("change", () => {
            key[j] = Number.isFinite(input.valueAsNumber)
              ? input.valueAsNumber
              : null;
            change();
            draw();
          });
          td.append(input);
          tr.append(td);
        }
        const td = document.createElement("td");
        const insert = document.createElement("button");
        insert.textContent = "INSERT AFTER";
        insert.disabled = i === p.keyframes.length - 1;
        insert.addEventListener("click", () => insertKey(i));
        const remove = document.createElement("button");
        remove.textContent = "DELETE KEY";
        remove.disabled = i === 0 || i === p.keyframes.length - 1;
        remove.addEventListener("click", () => {
          p.keyframes.splice(i, 1);
          renderKeys();
          change();
          draw();
        });
        td.append(insert, remove);
        tr.append(td);
        body.append(tr);
      });
    }
    function insertKey(i) {
      const p = current();
      if (p.keyframes.length >= 100) {
        setStatus("Maximum 100 assembly keys.");
        return;
      }
      const a = p.keyframes[i],
        b = p.keyframes[i + 1];
      p.keyframes.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      renderKeys();
      change();
      draw();
    }
    function draw() {
      const p = current(),
        errors = A.validateProfile(p),
        canvas = $("assembly-graph"),
        ctx = canvas.getContext("2d"),
        w = Math.max(260, Math.round(canvas.getBoundingClientRect().width)),
        h = 210,
        dpr = Math.min(devicePixelRatio || 1, 3);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.aspectRatio = `${w}/${h}`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      $("assembly-readout").textContent = errors.length
        ? errors.join(" ")
        : `${time.toFixed(2)}s / ${((A.sampleProfile(p, time) * 180) / Math.PI).toFixed(1)}°`;
      const ring = $("assembly-animation"),
        x = ring.getContext("2d");
      x.clearRect(0, 0, 240, 240);
      if (errors.length) return;
      time = Math.min(time, p.duration);
      $("assembly-time").max = p.duration;
      const lo = Math.min(...p.keyframes.map((k) => k[1]), 0) - 10,
        hi = Math.max(...p.keyframes.map((k) => k[1]), 0) + 10,
        px = (t) => 50 + (t / p.duration) * (w - 64),
        py = (a) => 175 - ((a - lo) / (hi - lo)) * 150;
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
      for (const a of [lo, hi]) ctx.fillText(`${a.toFixed(0)}°`, 46, py(a) + 4);
      ctx.strokeStyle = "#b6d68d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 800; i++) {
        const t = (p.duration * i) / 800,
          y = py((A.sampleProfile(p, t) * 180) / Math.PI);
        i ? ctx.lineTo(px(t), y) : ctx.moveTo(px(t), y);
      }
      ctx.stroke();
      ctx.fillStyle = "#e2e7ed";
      for (const [t, a] of p.keyframes) {
        ctx.beginPath();
        ctx.arc(px(t), py(a), 3, 0, Math.PI * 2);
        ctx.fill();
      }
      x.save();
      x.translate(120, 120);
      x.rotate(A.sampleProfile(p, time));
      for (const r of [55, 85]) {
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
      $("assembly-time").value = time;
    }
    $("assembly-edit-profile").addEventListener("change", () => {
      selected = $("assembly-edit-profile").value;
      render();
    });
    $("assembly-profile").addEventListener("change", () => {
      api.level().assembly.profileId = $("assembly-profile").value;
      change();
    });
    $("assembly-rate").addEventListener("change", () => {
      api.level().assembly.playbackSpeed = $("assembly-rate").valueAsNumber;
      change();
    });
    $("assembly-name").addEventListener("change", () => {
      current().name = $("assembly-name").value;
      change();
      options($("assembly-edit-profile"), selected);
      options($("assembly-profile"), api.level().assembly.profileId);
    });
    $("assembly-duration").addEventListener("change", () => {
      current().duration = $("assembly-duration").valueAsNumber;
      change();
      draw();
    });
    $("assembly-add-key").addEventListener("click", () => {
      const p = current();
      let at = 0;
      for (let i = 1; i < p.keyframes.length - 1; i++)
        if (
          p.keyframes[i + 1][0] - p.keyframes[i][0] >
          p.keyframes[at + 1][0] - p.keyframes[at][0]
        )
          at = i;
      insertKey(at);
    });
    function add(copy) {
      if (api.document().assemblyProfiles.length >= 256) {
        setStatus("Maximum 256 assembly profiles.");
        return;
      }
      const p = copy
        ? JSON.parse(JSON.stringify(current()))
        : {
            name: "New assembly motion",
            duration: 25,
            keyframes: [
              [0, 0],
              [25, 0],
            ],
          };
      p.id = `custom-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
      if (copy) p.name = (p.name + " copy").slice(0, 80);
      api.document().assemblyProfiles.push(p);
      selected = p.id;
      change();
      render();
    }
    $("assembly-duplicate").addEventListener("click", () => add(true));
    $("assembly-new").addEventListener("click", () => add(false));
    $("assembly-delete-profile").addEventListener("click", () => {
      const p = current();
      if (p.id === "gentle-drift") return;
      const references = api
        .document()
        .levels.filter((l) => l.assembly.profileId === p.id);
      if (references.length) {
        setStatus(
          `Choose another assembly profile for Levels ${references.map((l) => l.number).join(", ")} before deleting.`,
        );
        return;
      }
      api.document().assemblyProfiles = api
        .document()
        .assemblyProfiles.filter((p) => p.id !== selected);
      selected = api.document().assemblyProfiles[0].id;
      change();
      render();
    });
    $("assembly-play").addEventListener("click", () => {
      if (A.validateProfile(current()).length) return;
      playing = !playing;
      $("assembly-play").textContent = playing ? "PAUSE" : "PLAY";
    });
    $("assembly-time").addEventListener("input", () => {
      playing = false;
      $("assembly-play").textContent = "PLAY";
      time = Number($("assembly-time").value);
      draw();
    });
    window.addEventListener("resize", draw);
    return {
      render,
      tick(dt) {
        if (playing) {
          time =
            (time + dt * Number($("assembly-preview-speed").value)) %
            current().duration;
          draw();
        }
      },
      pause() {
        playing = false;
        $("assembly-play").textContent = "PLAY";
      },
    };
  },
};
