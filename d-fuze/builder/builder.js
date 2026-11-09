"use strict";
// Disposable public deterrent only. Change this constant to replace the code.
const ACCESS_CODE = "FUSE-LAB-3";
const ACCESS_KEY = "d-fuze-builder-access-v1";
const S = DFuzeSchema,
  M = DFuzeExperimentalMotion,
  geometry = DFuzeRings.GEOMETRY;
const $ = (id) => document.getElementById(id);
let doc = S.defaults(),
  selected = 0,
  unlocked = false;
let profileIndex = 0,
  profileTime = 0,
  profilePlaying = false,
  previewTime = 0,
  previewPlaying = false,
  previewProfiles = [];
function status(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
function rememberSession() {
  // Keep the last valid workspace, rather than overwriting it with unfinished numeric edits.
  if (S.validateDocument(doc).length) return;
  try {
    sessionStorage.setItem(
      S.SESSION_KEY,
      JSON.stringify({ document: doc, selected }),
    );
  } catch {
    status(
      "This browser blocked session storage. Test launch/return cannot preserve edits.",
      true,
    );
  }
}
function restoreSession() {
  try {
    const saved = sessionStorage.getItem(S.SESSION_KEY);
    if (saved) {
      const value = JSON.parse(saved);
      doc = S.requireValid(value.document);
      selected = Math.min(
        Math.max(0, Number(value.selected) || 0),
        doc.levels.length - 1,
      );
    }
  } catch {
    status(
      "Previous session could not be restored. Defaults loaded; local saved drafts are still available.",
      true,
    );
  }
}
function current() {
  return doc.levels[selected];
}
function inputNumber(value, field, onChange, label) {
  const input = document.createElement("input");
  input.type = "number";
  input.value = value ?? "";
  input.min = field.min;
  input.max = field.max;
  input.step = field.step || 1;
  input.setAttribute("aria-label", label || field.label);
  input.addEventListener("change", () =>
    onChange(Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : null),
  );
  return input;
}
function label(text, element) {
  const l = document.createElement("label");
  l.append(document.createTextNode(text), element);
  return l;
}
function button(text, action) {
  const b = document.createElement("button");
  b.textContent = text;
  b.addEventListener("click", action);
  return b;
}
function change() {
  rememberSession();
  check();
  resetPreview();
}
function renumber() {
  doc.levels.forEach((l, i) => (l.number = i + 1));
}
function renderTable() {
  const head = $("level-table").querySelector("thead");
  head.replaceChildren();
  const hr = document.createElement("tr");
  for (const text of [
    "Level",
    ...Object.values(S.FIELDS).map((f) => f.label),
  ]) {
    const th = document.createElement("th");
    th.textContent = text;
    hr.append(th);
  }
  head.append(hr);
  const body = $("level-table").querySelector("tbody");
  body.replaceChildren();
  doc.levels.forEach((level, index) => {
    const tr = document.createElement("tr");
    tr.classList.toggle("selected", index === selected);
    const cell = document.createElement("td");
    const select = button(`EDIT ${level.number}`, () => {
      selected = index;
      renderAll();
      rememberSession();
    });
    select.setAttribute("aria-pressed", String(index === selected));
    cell.append(select);
    tr.append(cell);
    for (const [key, field] of Object.entries(S.FIELDS)) {
      const td = document.createElement("td");
      const input = inputNumber(
        level[key],
        field,
        (value) => {
          level[key] = value;
          if (
            key === "ringCount" &&
            Number.isInteger(value) &&
            value >= 1 &&
            value <= 4
          ) {
            while (level.rings.length < value)
              level.rings.push(S.defaultRing(level.rings.length + 1));
            level.rings.length = value;
          }
          selected = index;
          renderAll();
          change();
        },
        `Level ${level.number} ${field.label}`,
      );
      input.dataset.field = key;
      input.dataset.row = index;
      td.append(input);
      tr.append(td);
    }
    body.append(tr);
  });
}
function renderRings() {
  const level = current();
  $("selected-label").textContent = `/ Level ${level.number}`;
  $("level-name").value = level.name || "";
  $("level-seed").value = level.seed ?? "";
  $("ring-editor").replaceChildren();
  level.rings.forEach((ring, i) => {
    const row = document.createElement("div");
    row.className = "ring-row";
    const number = document.createElement("strong");
    number.textContent = `Ring ${i + 1}`;
    row.append(number);
    row.append(
      label(
        "Gate width °",
        inputNumber(
          ring.gateWidth,
          { min: 10, max: 180, step: 1 },
          (v) => {
            ring.gateWidth = v;
            change();
          },
          `Ring ${i + 1} gate width`,
        ),
      ),
    );
    row.append(
      label(
        "Gate health",
        inputNumber(
          ring.gateHealth,
          { min: 1, max: 50, step: 1 },
          (v) => {
            ring.gateHealth = v;
            change();
          },
          `Ring ${i + 1} gate health`,
        ),
      ),
    );
    const family = document.createElement("select");
    family.setAttribute("aria-label", `Ring ${i + 1} family`);
    for (const [id, f] of Object.entries(M.FAMILIES)) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = f.label;
      family.append(option);
    }
    family.value = ring.family;
    family.addEventListener("change", () => {
      ring.family = family.value;
      ring.profiles = M.eligible(ring.family).map((p) => p.id);
      renderRings();
      change();
    });
    row.append(label("Motion family", family));
    const eligible = document.createElement("fieldset");
    eligible.className = "profiles-list";
    const legend = document.createElement("legend");
    legend.textContent = "Eligible profiles";
    eligible.append(legend);
    for (const profile of M.eligible(ring.family)) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = ring.profiles.includes(profile.id);
      checkbox.setAttribute("aria-label", `Ring ${i + 1}: ${profile.name}`);
      checkbox.addEventListener("change", () => {
        if (!checkbox.checked && ring.profiles.length === 1) {
          checkbox.checked = true;
          status("Keep at least one eligible profile for each ring.", true);
          return;
        }
        ring.profiles = M.eligible(ring.family)
          .filter((p) =>
            p.id === profile.id
              ? checkbox.checked
              : ring.profiles.includes(p.id),
          )
          .map((p) => p.id);
        change();
      });
      eligible.append(label(profile.name, checkbox));
    }
    row.append(eligible);
    $("ring-editor").append(row);
  });
}
function check() {
  const errors = S.validateDocument(doc);
  const container = $("errors");
  container.replaceChildren();
  if (errors.length) {
    const list = document.createElement("ul");
    list.className = "error";
    for (const error of errors) {
      const li = document.createElement("li");
      li.textContent = error;
      list.append(li);
    }
    container.append(list);
  } else {
    const p = document.createElement("p");
    p.className = "good";
    p.textContent = `${doc.levels.length} levels structurally valid. No human difficulty guarantee.`;
    container.append(p);
  }
  const levelErrors = S.validateLevel(current());
  $("test-level").disabled = errors.length > 0 || current().ringCount !== 1;
  $("test-explanation").textContent =
    current().ringCount !== 1
      ? "Animation preview only: multiple-ring gameplay arrives in Phase 4."
      : errors.length
        ? "Fix configuration errors before testing."
        : "Launches the real game with this experimental level. Published data is unchanged.";
  $("export-json").disabled =
    $("export-csv").disabled =
    $("save-draft").disabled =
      errors.length > 0;
  $("delete-level").disabled = doc.levels.length === 1;
  $("add-level").disabled = $("duplicate-level").disabled =
    doc.levels.length >= 200;
  $("move-up").disabled = selected === 0;
  $("move-down").disabled = selected === doc.levels.length - 1;
  return errors;
}
function resetPreview() {
  previewTime = 0;
  previewPlaying = false;
  previewProfiles = S.validateLevel(current()).length
    ? []
    : M.assignProfiles(current());
  $("assignments").textContent =
    previewProfiles
      .map(
        (p, i) =>
          `Ring ${i + 1}: ${p.name} (${M.FAMILIES[p.difficulty].label})`,
      )
      .join("\n") || "Fix level errors to preview.";
  drawLevel();
}
function renderAll() {
  renderTable();
  renderRings();
  check();
  resetPreview();
}
function loadDocument(next, message) {
  doc = next;
  selected = 0;
  renderAll();
  rememberSession();
  status(message);
}
$("add-level").addEventListener("click", () => {
  const level = S.clone(current());
  doc.levels.push(level);
  selected = doc.levels.length - 1;
  renumber();
  level.name = `Draft ${level.number}`;
  renderAll();
  change();
});
$("duplicate-level").addEventListener("click", () => {
  doc.levels.splice(selected + 1, 0, S.clone(current()));
  selected++;
  renumber();
  current().name = (current().name || "Level").slice(0, 70) + " copy";
  renderAll();
  change();
});
$("delete-level").addEventListener("click", () => {
  if (doc.levels.length < 2) return;
  doc.levels.splice(selected, 1);
  selected = Math.min(selected, doc.levels.length - 1);
  renumber();
  renderAll();
  change();
});
function move(delta) {
  const next = selected + delta;
  if (next < 0 || next >= doc.levels.length) return;
  [doc.levels[selected], doc.levels[next]] = [
    doc.levels[next],
    doc.levels[selected],
  ];
  selected = next;
  renumber();
  renderAll();
  change();
}
$("move-up").addEventListener("click", () => move(-1));
$("move-down").addEventListener("click", () => move(1));
$("level-name").addEventListener("input", () => {
  current().name = $("level-name").value;
  rememberSession();
  check();
});
$("level-seed").addEventListener("change", () => {
  current().seed = Number.isFinite($("level-seed").valueAsNumber)
    ? $("level-seed").valueAsNumber
    : null;
  change();
});
$("new-seed").addEventListener("click", () => {
  current().seed = Math.floor(Math.random() * 4294967296);
  $("level-seed").value = current().seed;
  change();
});
function viewedProfile() {
  return M.eligible($("profile-family").value)[profileIndex];
}
function renderProfile() {
  profileTime = 0;
  profilePlaying = false;
  $("profile-play").textContent = "PLAY";
  const p = viewedProfile();
  $("profile-title").textContent =
    `${M.FAMILIES[p.difficulty].label} ${profileIndex + 1} of 5 — ${p.name}`;
  $("profile-windows").textContent =
    `${p.id} · 10-second cycle · aligned ${p.family.alignmentWindows.map(([a, b]) => `${a}–${b}s`).join(" and ")} (shaded)`;
  drawGraph();
  drawProfile();
}
$("profile-family").addEventListener("change", () => {
  profileIndex = 0;
  renderProfile();
});
$("profile-prev").addEventListener("click", () => {
  profileIndex = (profileIndex + 4) % 5;
  renderProfile();
});
$("profile-next").addEventListener("click", () => {
  profileIndex = (profileIndex + 1) % 5;
  renderProfile();
});
$("profile-play").addEventListener("click", () => {
  profilePlaying = !profilePlaying;
  $("profile-play").textContent = profilePlaying ? "PAUSE" : "PLAY";
});
$("profile-time").addEventListener("input", () => {
  profilePlaying = false;
  $("profile-play").textContent = "PLAY";
  profileTime = Number($("profile-time").value);
  drawProfile();
});
function drawGraph() {
  const canvas = $("profile-graph"),
    ctx = canvas.getContext("2d"),
    p = viewedProfile(),
    width = Math.max(260, Math.round(canvas.getBoundingClientRect().width)),
    height = width < 500 ? 210 : 260,
    left = 52,
    right = width - 14,
    top = 20,
    bottom = height - 35,
    dpr = Math.min(devicePixelRatio || 1, 3);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.aspectRatio = `${width}/${height}`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const max = Math.max(180, ...p.keyframes.map((k) => Math.abs(k[1]))) * 1.1;
  const px = (t) => left + (t / 10) * (right - left),
    py = (a) => (top + bottom) / 2 - ((a / max) * (bottom - top)) / 2;
  for (const [a, b] of p.family.alignmentWindows) {
    ctx.fillStyle = "#35614666";
    ctx.fillRect(px(a), top, px(b) - px(a), bottom - top);
  }
  ctx.strokeStyle = "#596775";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.moveTo(left, py(0));
  ctx.lineTo(right, py(0));
  ctx.stroke();
  ctx.fillStyle = "#cbd4df";
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  for (let t = 0; t <= 10; t += 2) ctx.fillText(`${t}s`, px(t), height - 10);
  ctx.textAlign = "right";
  for (const a of [
    -Math.floor(max / 100) * 100,
    0,
    Math.floor(max / 100) * 100,
  ])
    ctx.fillText(`${a}°`, left - 6, py(a) + 4);
  ctx.strokeStyle = "#86bdff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 1000; i++) {
    const t = i / 100,
      angle = (M.sampleProfile(p, t) * 180) / Math.PI;
    if (i === 0) ctx.moveTo(px(t), py(angle));
    else ctx.lineTo(px(t), py(angle));
  }
  ctx.stroke();
  ctx.fillStyle = "#e5e9ef";
  for (const [t, a] of p.keyframes) {
    ctx.beginPath();
    ctx.arc(px(t), py(a), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
function drawRing(ctx, radius, width, angle, thickness = 8) {
  const start = angle - width / 2;
  ctx.lineWidth = thickness;
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#ef6258";
  ctx.beginPath();
  ctx.arc(0, 0, radius, start + width, start + Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#56adff";
  ctx.beginPath();
  ctx.arc(0, 0, radius, start, start + width);
  ctx.stroke();
}
function drawProfile() {
  const canvas = $("profile-ring"),
    ctx = canvas.getContext("2d"),
    p = viewedProfile(),
    angle = M.sampleProfile(p, profileTime);
  ctx.clearRect(0, 0, 240, 240);
  ctx.save();
  ctx.translate(120, 120);
  drawRing(ctx, 85, Math.PI / 3, angle + geometry.referenceOffset);
  ctx.restore();
  $("profile-time").value = profileTime;
  $("profile-readout").textContent =
    `${profileTime.toFixed(2)}s / ${((angle * 180) / Math.PI).toFixed(1)}°`;
}
function drawLevel() {
  const canvas = $("level-preview"),
    ctx = canvas.getContext("2d"),
    level = current(),
    time = previewTime * level.playbackSpeed;
  ctx.clearRect(0, 0, 600, 600);
  ctx.save();
  ctx.translate(300, 300);
  ctx.fillStyle = "#d65b2b";
  ctx.beginPath();
  ctx.arc(0, 0, geometry.bombRadius, 0, Math.PI * 2);
  ctx.fill();
  level.rings.forEach((r, i) => {
    if (previewProfiles[i])
      drawRing(
        ctx,
        geometry.ringRadius + i * geometry.ringSpacing,
        (r.gateWidth * Math.PI) / 180,
        M.sampleProfile(previewProfiles[i], time) + geometry.referenceOffset,
        geometry.ringThickness,
      );
  });
  ctx.restore();
  $("preview-readout").textContent =
    `Shared animation time: ${Number.isFinite(time) ? (time % 10).toFixed(2) : "—"} / 10s · level ${level.playbackSpeed}×`;
}
$("preview-play").addEventListener("click", () => {
  if (previewProfiles.length) previewPlaying = true;
});
$("preview-pause").addEventListener("click", () => (previewPlaying = false));
$("preview-restart").addEventListener("click", () => {
  previewTime = 0;
  drawLevel();
});
$("test-level").addEventListener("click", () => {
  try {
    const transfer = S.testPayload(current());
    sessionStorage.setItem(
      S.SESSION_KEY,
      JSON.stringify({ document: S.requireValid(doc), selected }),
    );
    sessionStorage.setItem(S.TEST_KEY, transfer);
    location.href = "../?test=1";
  } catch (e) {
    status(`Cannot launch test: ${e.message}`, true);
  }
});
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export-json").addEventListener("click", () => {
  try {
    download("d-fuze-levels-v1.json", S.exportJSON(doc), "application/json");
    status("JSON exported. Keep this file to share or back up your settings.");
  } catch (e) {
    status(e.message, true);
  }
});
$("export-csv").addEventListener("click", () => {
  try {
    download("d-fuze-level-table.csv", S.exportCSV(doc), "text/csv");
    status("Main level table exported as CSV. Ring details remain in JSON.");
  } catch (e) {
    status(e.message, true);
  }
});
$("import-json").addEventListener("change", async () => {
  const file = $("import-json").files[0];
  if (!file) return;
  try {
    if (file.size > 1000000)
      throw new Error("Choose a JSON file smaller than 1 MB.");
    const next = S.importJSON(await file.text());
    loadDocument(next, "JSON imported. Published gameplay has not changed.");
  } catch (e) {
    status(`Import rejected: ${e.message}`, true);
  } finally {
    $("import-json").value = "";
  }
});
$("save-draft").addEventListener("click", () => {
  try {
    S.saveDraft(localStorage, doc);
    status("Draft saved only in this browser; it does not sync with GitHub.");
  } catch (e) {
    status(`Could not save draft: ${e.message}`, true);
  }
});
$("load-draft").addEventListener("click", () => {
  try {
    loadDocument(S.loadDraft(localStorage), "Saved browser draft loaded.");
  } catch (e) {
    status(e.message, true);
  }
});
$("reset-defaults").addEventListener("click", () => {
  if (
    confirm(
      "Replace current edits with the 12 experimental defaults? Export or save a draft first if needed.",
    )
  )
    loadDocument(
      S.defaults(),
      "Experimental defaults restored. Saved local draft was not deleted.",
    );
});
function unlock() {
  unlocked = true;
  $("access-error").textContent = "";
  $("access-code").value = "";
  $("access-dialog").close();
  $("builder").hidden = false;
  restoreSession();
  renderAll();
  renderProfile();
  rememberSession();
}
$("access-dialog").addEventListener("cancel", (e) => e.preventDefault());
$("access-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if ($("access-code").value !== ACCESS_CODE) {
    $("access-error").textContent = "Code not recognized.";
    return;
  }
  try {
    sessionStorage.setItem(ACCESS_KEY, ACCESS_CODE);
  } catch {}
  unlock();
});
$("lock").addEventListener("click", () => {
  rememberSession();
  try {
    sessionStorage.removeItem(ACCESS_KEY);
  } catch {}
  unlocked = false;
  profilePlaying = previewPlaying = false;
  $("builder").hidden = true;
  $("access-code").value = "";
  $("access-dialog").showModal();
});
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (unlocked && !document.hidden) {
    if (profilePlaying) {
      profileTime = (profileTime + dt * Number($("profile-speed").value)) % 10;
      drawProfile();
    }
    if (previewPlaying) {
      previewTime += dt * Number($("preview-speed").value);
      drawLevel();
    }
  }
  requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", () => {
  profilePlaying = previewPlaying = false;
  $("profile-play").textContent = "PLAY";
  last = performance.now();
});
try {
  if (sessionStorage.getItem(ACCESS_KEY) === ACCESS_CODE) unlock();
  else $("access-dialog").showModal();
} catch {
  $("access-dialog").showModal();
}
window.addEventListener("resize", () => {
  if (unlocked) drawGraph();
});
requestAnimationFrame(frame);
