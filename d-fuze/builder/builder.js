"use strict";
// Disposable public deterrent only. Change this constant to replace the code.
const ACCESS_CODE = "FUSE-LAB-3";
const ACCESS_KEY = "d-fuze-builder-access-v1";
const S = DFuzeSchema,
  M = DFuzeExperimentalMotion,
  geometry = DFuzeRings.GEOMETRY;
const $ = (id) => document.getElementById(id);
let assemblyEditor = null;
let doc = null,
  baseline = null,
  selected = 0,
  unlocked = false;
let previewTime = 0,
  previewPlaying = false,
  previewProfiles = [];
function status(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
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
    const width = document.createElement("select");
    width.setAttribute("aria-label", `Ring ${i + 1} gate width`);
    for (let deg = 10; deg <= 120; deg += 10) {
      const o = document.createElement("option");
      o.value = deg;
      o.textContent = `${deg}°`;
      width.append(o);
    }
    width.value = ring.gateWidth;
    width.addEventListener("change", () => {
      ring.gateWidth = Number(width.value);
      change();
    });
    row.append(label("Gate width", width));
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
      renderRings();
      change();
    });
    row.append(label("Motion family", family));
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
  const levelErrors = S.validateLevel(current(), "Level", doc.assemblyProfiles);
  $("test-level").disabled = errors.length > 0 || current().ringCount > 2;
  $("test-explanation").textContent =
    current().ringCount > 2
      ? "Animation preview only: three- and four-ring gameplay arrives in Phase 5."
      : errors.length
        ? "Fix configuration errors before testing."
        : "Launches the real game with this experimental level. Published data is unchanged.";
  $("delete-level").disabled = doc.levels.length === 1;
  $("add-level").disabled = $("duplicate-level").disabled =
    doc.levels.length >= 200;
  $("move-up").disabled = selected === 0;
  $("move-down").disabled = selected === doc.levels.length - 1;
  return errors;
}
function resetPreview() {
  $("preview-play").textContent = "PLAY";
  previewTime = 0;
  previewPlaying = false;
  previewProfiles = S.validateLevel(current(), "Level", doc.assemblyProfiles)
    .length
    ? []
    : M.assignProfiles(current(), current().seed, doc.ringProfiles);
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
  assemblyEditor?.render();
}
function loadDocument(next, message) {
  doc = next;
  selected = 0;
  renderAll();
  status(
    message +
      (next.migrationNotes?.length
        ? "\n" + next.migrationNotes.join("\n")
        : ""),
  );
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
        M.sampleProfile(previewProfiles[i], time) +
          geometry.referenceOffset +
          (previewProfiles.length
            ? DFuzeAssembly.sampleProfile(
                doc.assemblyProfiles.find(
                  (p) => p.id === level.assembly.profileId,
                ),
                previewTime * level.assembly.playbackSpeed,
              )
            : 0),
        geometry.ringThickness,
      );
  });
  ctx.restore();
  $("preview-readout").textContent =
    `Shared animation time: ${Number.isFinite(time) ? (time % 10).toFixed(2) : "—"} / 10s · level ${level.playbackSpeed}×`;
}
$("preview-play").addEventListener("click", () => {
  if (!previewProfiles.length) return;
  previewPlaying = !previewPlaying;
  previewTime = 0;
  $("preview-play").textContent = previewPlaying ? "STOP" : "PLAY";
  drawLevel();
});
$("test-level").addEventListener("click", () => {
  try {
    const transfer = S.testPayload(
      current(),
      doc.assemblyProfiles,
      doc.ringProfiles,
    );
    if (check().length) throw Error("Fix configuration errors before testing.");
    const tab = window.open("about:blank", "_blank");
    if (!tab) throw Error("Allow the Test Mode tab to open.");
    try {
      tab.sessionStorage.setItem(S.TEST_KEY, transfer);
      tab.location.href = new URL("../?test=1", location.href).href;
    } catch (error) {
      tab.close();
      throw error;
    }
    status(
      "Test Mode opened in a separate tab. Your editor changes remain here in memory.",
    );
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
$("publish").addEventListener("click", () => {
  try {
    if (check().length)
      throw Error("Fix the configuration errors before publishing.");
    const validated = DFuzeLevels.validatePublished(doc);
    download(
      "published-levels.json",
      S.exportJSON(validated),
      "application/json",
    );
    status(
      "Published configuration exported to your device. It is NOT LIVE. Codex must install this file and GitHub Pages must deploy it.",
    );
  } catch (e) {
    status(`Publish blocked: ${e.message}`, true);
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
async function unlock() {
  try {
    if (!doc) {
      doc = await DFuzeLevels.loadPublished();
      baseline = JSON.stringify(doc);
      selected = 0;
    }
  } catch (e) {
    $("access-error").textContent = `Cannot load published data: ${e.message}`;
    if (!$("access-dialog").open) $("access-dialog").showModal();
    return;
  }
  unlocked = true;
  $("access-error").textContent = "";
  $("access-code").value = "";
  $("access-dialog").close();
  $("builder").hidden = false;
  assemblyEditor ??= DFuzeMotionEditor.mount({
    document: () => doc,
    level: current,
    changed: change,
    status,
  });
  renderAll();
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
  try {
    sessionStorage.removeItem(ACCESS_KEY);
  } catch {}
  unlocked = false;
  resetPreview();
  assemblyEditor?.pause();
  $("builder").hidden = true;
  $("access-code").value = "";
  $("access-dialog").showModal();
});
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (unlocked && !document.hidden) {
    assemblyEditor?.tick(dt);
    if (previewPlaying) {
      previewTime += dt;
      drawLevel();
    }
  }
  requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", () => {
  if (doc) resetPreview();
  assemblyEditor?.pause();
  last = performance.now();
});
try {
  if (sessionStorage.getItem(ACCESS_KEY) === ACCESS_CODE) unlock();
  else $("access-dialog").showModal();
} catch {
  $("access-dialog").showModal();
}
requestAnimationFrame(frame);

$("reload-published").addEventListener("click", async () => {
  if (
    JSON.stringify(doc) !== baseline &&
    !confirm("Discard unsaved edits and reload published data?")
  )
    return;
  try {
    const next = await DFuzeLevels.loadPublished();
    baseline = JSON.stringify(next);
    loadDocument(
      next,
      "Published data reloaded. Experimental edits were discarded.",
    );
  } catch (e) {
    status(`Reload failed; current edits retained: ${e.message}`, true);
  }
});
