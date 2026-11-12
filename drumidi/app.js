"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    D = window.DruMidi,
    KEY = "app-lab-drumidi-v1",
    audio = new DrumAudio();
  let project = D.fresh(),
    page = "pattern",
    selected = 0,
    bar = 0,
    drum = 35,
    position = 0,
    library = "P1",
    clipTarget = null,
    busy = false,
    storageWarning = "",
    clipboard = null,
    patternTarget = 0;
  const say = (message) => {
    $("status").textContent = message;
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      project = D.validate(saved);
      if (saved.version === 1) {
        try {
          localStorage.setItem(KEY, JSON.stringify(project));
        } catch {
          storageWarning =
            "Project migrated, but automatic saving is unavailable. Use Save Project to download a JSON backup.";
        }
      }
    }
  } catch (e) {
    storageWarning =
      "Could not restore automatic save: " +
      e.message +
      " Load a JSON backup or save a new project.";
  }
  const el = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const option = (value, text) => {
    const o = el("option", "", text);
    o.value = value;
    return o;
  };
  const button = (text, action, className = "") => {
    const b = el("button", className, text);
    b.type = "button";
    b.onclick = action;
    return b;
  };
  const lengthText = (bars) => `${bars} bar${bars === 1 ? "" : "s"}`;
  const active = () => project.patterns[selected];
  const bars = () =>
    page === "pattern" ? active().bars : project.arrangement.bars;
  const allEvents = (includeMuted = false) =>
    D.events(project, page, selected, includeMuted);
  const laneLetter = (lane) => String.fromCharCode(65 + lane);
  const color = (p) => D.palette.find((c) => c.id === p.color).hex;
  function transport() {
    const isPlaying = audio.running || busy;
    if ($("play").dataset.playing !== String(isPlaying)) {
      $("play").textContent = isPlaying ? "■ Stop" : "▷ Start";
      $("play").dataset.playing = String(isPlaying);
    }
    $("play").setAttribute("aria-label", isPlaying ? "Stop" : "Start");
    $("play").setAttribute("aria-pressed", String(isPlaying));
    $("bpm").value = project.bpm;
    $("playback-label").textContent =
      page === "pattern" ? active().id : "A + B + C · Arrangement";
    $("playback-meta").textContent =
      `${lengthText(bars())} · ${project.bpm} BPM`;
  }
  function stop() {
    audio.stop();
    busy = false;
    $("play").disabled = false;
    transport();
  }
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(project));
      storageWarning = "";
    } catch {
      storageWarning =
        "Automatic saving is unavailable or full. Use Save Project to download a JSON backup.";
      say(storageWarning);
    }
    $("storage-status").textContent =
      storageWarning || "Automatic save is up to date in this browser.";
  }
  function changed(message) {
    stop();
    persist();
    render();
    say(storageWarning || message || "Saved automatically · Loop on");
  }
  function icon(midi) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("class", "drum-icon");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = /hat|Ride|Cymbal|Crash/.test(D.catalog[midi - 35].name)
      ? '<path d="M16 4v24M9 28h14M4 13q12-7 24 0Q16 18 4 13Z" fill="none" stroke="currentColor" stroke-width="2"/>'
      : '<ellipse cx="16" cy="7" rx="12" ry="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 7v17q12 8 24 0V7M9 13v9m14-9v9m-7-7v10" fill="none" stroke="currentColor" stroke-width="2"/>';
    return svg;
  }
  function longPress(target, action) {
    let timer,
      x,
      y,
      held = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    target.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      held = false;
      x = e.clientX;
      y = e.clientY;
      timer = setTimeout(() => {
        held = true;
        action();
      }, 550);
    });
    target.addEventListener("pointermove", (e) => {
      if (Math.abs(e.clientX - x) > 8 || Math.abs(e.clientY - y) > 8) cancel();
    });
    ["pointerup", "pointercancel", "dragstart"].forEach((type) =>
      target.addEventListener(type, cancel),
    );
    target.addEventListener(
      "click",
      (e) => {
        if (held) {
          held = false;
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true,
    );
    target.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      cancel();
      held = true;
      action();
    });
  }
  function updatePasteAvailability() {
    const empty = D.isEmptyPattern(project.patterns[patternTarget]);
    $("paste-pattern").disabled = !clipboard || !empty;
    $("paste-explanation").textContent = !empty
      ? "Paste is available only for empty patterns (zero notes). Delete this pattern first to paste."
      : !clipboard
        ? "Copy a pattern to enable Paste. An empty pattern has zero notes, regardless of its length."
        : "Destination is empty. Paste will retain its ID, color and arrangement clips.";
  }
  function openPatternMenu(index) {
    if ($("pattern-dialog").open) return;
    $("pattern-picker").close();
    patternTarget = index;
    const p = project.patterns[index];
    $("pattern-title").textContent = `${p.id} · Pattern actions`;
    updatePasteAvailability();
    $("pattern-message").textContent = clipboard
      ? `Clipboard: ${clipboard.id}, ${lengthText(clipboard.bars)}`
      : "Copy a pattern to enable Paste.";
    $("color-palette").hidden = true;
    $("change-color").setAttribute("aria-expanded", "false");
    $("color-palette").replaceChildren(
      ...D.palette.map((c) => {
        const b = button(
          c.name,
          () => {
            project.patterns[patternTarget].color = c.id;
            changed(`${p.id} color saved`);
            for (const child of $("color-palette").children)
              child.setAttribute(
                "aria-pressed",
                String(child.dataset.color === c.id),
              );
          },
          "color-choice",
        );
        b.style.setProperty("--pattern-color", c.hex);
        b.dataset.color = c.id;
        b.setAttribute("aria-pressed", String(p.color === c.id));
        return b;
      }),
    );
    $("pattern-dialog").showModal();
  }
  $("copy-pattern").onclick = () => {
    clipboard = D.copyPattern(project.patterns[patternTarget]);
    updatePasteAvailability();
    $("pattern-message").textContent =
      `Copied ${clipboard.id}, including length, notes and velocities.`;
  };
  $("paste-pattern").onclick = () => {
    if (!clipboard) return;
    let candidate;
    try {
      candidate = D.pastePattern(project, patternTarget, clipboard);
    } catch {
      $("pattern-message").textContent =
        "Cannot paste: pattern length would overlap clips or extend past the timeline. Move or remove those clips first.";
      return;
    }
    if (
      !confirm(
        `Replace ${project.patterns[patternTarget].id} with the copied pattern? Its color and arrangement references will be retained.`,
      )
    )
      return;
    project = candidate;
    bar = Math.min(bar, active().bars - 1);
    $("pattern-dialog").close();
    changed("Pattern pasted · Destination color retained");
  };
  $("delete-pattern").onclick = () => {
    const p = project.patterns[patternTarget];
    let candidate;
    try {
      candidate = D.deletePattern(project, patternTarget);
    } catch {
      $("pattern-message").textContent =
        "Cannot delete: the resulting arrangement would contain overlaps or invalid boundaries.";
      return;
    }
    const referenced = project.arrangement.lanes.some((lane) =>
      lane.some((c) => c.pattern === p.id),
    );
    if (
      (!D.isEmptyPattern(p) || referenced) &&
      !confirm(
        `Delete all notes in ${p.id} and reset it to one bar? Its ID, color and arrangement clips will be retained.`,
      )
    )
      return;
    project = candidate;
    bar = Math.min(bar, active().bars - 1);
    $("pattern-dialog").close();
    changed(`${p.id} deleted · Reset to one bar · Clips retained`);
  };
  $("change-color").onclick = () => {
    $("color-palette").hidden = !$("color-palette").hidden;
    $("change-color").setAttribute(
      "aria-expanded",
      String(!$("color-palette").hidden),
    );
  };
  function toggleMute(midi) {
    const d = project.drums.find((d) => d.midi === midi);
    d.muted = !d.muted;
    audio.setMuted(project.drums);
    persist();
    render();
    $("drum-grid")
      .querySelector(`[data-midi="${midi}"]`)
      .focus({ preventScroll: true });
    say(`${d.name} ${d.muted ? "muted" : "unmuted"} globally · Notes retained`);
  }

  function renderPattern() {
    $("pattern").textContent = active().id + " ▾";
    $("pattern").style.setProperty("--pattern-color", color(active()));
    $("pattern").setAttribute("aria-label", `Pattern ${active().id}`);
    $("pattern-options").replaceChildren(
      ...project.patterns.map((p, i) => {
        const b = button(
          p.id,
          () => {
            selectPattern(i);
            $("pattern-picker").close();
          },
          "pattern-option",
        );
        b.style.setProperty("--pattern-color", color(p));
        b.setAttribute("aria-pressed", String(i === selected));
        longPress(b, () => openPatternMenu(i));
        return b;
      }),
    );
    $("length").value = active().bars;
    $("bars").replaceChildren();
    for (let i = 0; i < active().bars; i++) {
      const b = button(`Bar ${i + 1}`, () => {
        bar = i;
        renderPattern();
      });
      b.setAttribute("aria-pressed", String(bar === i));
      $("bars").append(b);
    }
    $("previous").disabled = bar === 0;
    $("next").disabled = bar === active().bars - 1;
    const grid = $("drum-grid"),
      scroll = grid.scrollTop;
    grid.replaceChildren();
    for (const d of project.drums) {
      const row = el("div", "drum-row"),
        label = button(
          "",
          () => toggleMute(d.midi),
          "drum-name" +
            (drum === d.midi ? " selected" : "") +
            (d.muted ? " muted" : ""),
        );
      label.dataset.midi = d.midi;
      label.setAttribute("aria-label", `Mute ${d.name}`);
      label.setAttribute("aria-pressed", String(d.muted));
      label.append(
        icon(d.midi),
        el(
          "span",
          "",
          d.name
            .replace("Acoustic Kick", "Kick")
            .replace("Closed Hi-hat", "Hi-hat")
            .replace("Open Hi-hat", "Open hat"),
        ),
      );
      if (d.muted) label.append(el("small", "mute-indicator", "MUTE"));
      label.title = `GM ${d.midi} · Default velocity ${d.velocity} · ${d.muted ? "Muted: tap to unmute" : "Tap to mute"}`;
      row.append(label);
      const cells = el("div", "cells");
      for (let i = 0; i < 8; i++) {
        const notes = active().notes.filter(
          (n) =>
            n.drum === d.midi &&
            n.step >= bar * 64 + i * 8 &&
            n.step < bar * 64 + i * 8 + 8,
        );
        const isSelected = drum === d.midi && position === i;
        const b = button(
          "",
          () => {
            drum = d.midi;
            position = i;
            renderPattern();
            $("drum-grid")
              .querySelector(".cell.selected")
              .focus({ preventScroll: true });
          },
          "cell" +
            (notes.length ? " has-notes" : "") +
            (isSelected ? " selected" : ""),
        );
        b.dataset.drum = d.midi;
        b.dataset.position = i;
        b.setAttribute(
          "aria-label",
          `${d.name}, bar ${bar + 1}, position ${i + 1}, ${notes.length} hits`,
        );
        b.setAttribute("aria-pressed", String(isSelected));
        if (notes.length > 1) b.append(el("small", "", notes.length));
        cells.append(b);
      }
      row.append(cells);
      grid.append(row);
    }
    grid.scrollTop = scroll;
    renderSubdivisions();
  }
  function renderSubdivisions() {
    const d = project.drums.find((d) => d.midi === drum) || project.drums[0];
    drum = d.midi;
    $("selection-title").textContent =
      `${d.name.replace("Acoustic Kick", "Kick")} — Bar ${bar + 1}, Position ${position + 1}`;
    $("subdivisions").replaceChildren();
    for (let i = 0; i < 8; i++) {
      const step = bar * 64 + position * 8 + i,
        note = active().notes.find((n) => n.drum === drum && n.step === step),
        b = button(String(i + 1), () => {
          const index = active().notes.findIndex(
            (n) => n.drum === drum && n.step === step,
          );
          if (index === -1)
            active().notes.push({ drum, step, velocity: d.velocity });
          else active().notes.splice(index, 1);
          changed("Pattern saved · 64th-note precision");
          $("subdivisions").children[i].focus({ preventScroll: true });
        });
      b.setAttribute("aria-pressed", String(!!note));
      b.setAttribute(
        "aria-label",
        `Subdivision ${i + 1}${note ? `, velocity ${note.velocity}` : ""}`,
      );
      $("subdivisions").append(b);
    }
  }
  function drag(b, data) {
    b.draggable = true;
    b.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("application/x-drumidi", JSON.stringify(data));
      e.dataTransfer.effectAllowed = data.id ? "move" : "copy";
    });
  }
  function renderArrangement() {
    $("arrangement-length").value = project.arrangement.bars;
    $("library").replaceChildren();
    for (const p of project.patterns) {
      const b = button(
        "",
        () => {
          library = p.id;
          renderArrangement();
          $("placement").textContent =
            `${library} selected. Tap an empty bar in either lane.`;
        },
        "library-pattern",
      );
      b.append(el("strong", "", p.id), el("small", "", lengthText(p.bars)));
      b.setAttribute("aria-label", `${p.id}, ${lengthText(p.bars)}`);
      b.setAttribute("aria-pressed", String(library === p.id));
      b.style.setProperty("--pattern-color", color(p));
      longPress(b, () => openPatternMenu(project.patterns.indexOf(p)));
      drag(b, { pattern: p.id });
      $("library").append(b);
    }
    const timeline = $("timeline");
    timeline.replaceChildren();
    timeline.style.setProperty("--bars", project.arrangement.bars);
    const ruler = el("div", "ruler");
    ruler.append(el("span", "", "Bar"));
    for (let i = 0; i < project.arrangement.bars; i++)
      ruler.append(el("span", "", i + 1));
    timeline.append(ruler);
    project.arrangement.lanes.forEach((clips, lane) => {
      const row = el("div", "lane lane-" + laneLetter(lane).toLowerCase());
      row.append(el("span", "lane-label", laneLetter(lane)));
      row.setAttribute(
        "aria-label",
        `Lane ${laneLetter(lane)} — ${D.laneNames[lane]}`,
      );
      for (let i = 0; i < project.arrangement.bars; i++) {
        const b = button(
          "+",
          () => place({ pattern: library }, lane, i),
          "bar-slot",
        );
        b.style.gridColumn = i + 2;
        b.setAttribute(
          "aria-label",
          `Place ${library} in lane ${laneLetter(lane)}, bar ${i + 1}`,
        );
        row.append(b);
      }
      for (const c of clips) {
        const p = project.patterns.find((p) => p.id === c.pattern),
          b = button("", () => openClip(c, lane), "clip");
        b.style.gridColumn = `${c.start + 2} / span ${p.bars}`;
        b.style.setProperty("--pattern-color", color(p));
        b.append(el("strong", "", p.id), el("small", "", lengthText(p.bars)));
        b.setAttribute(
          "aria-label",
          `${p.id}, lane ${laneLetter(lane)}, bar ${c.start + 1}, ${lengthText(p.bars)}. Clip actions`,
        );
        drag(b, { id: c.id, pattern: c.pattern });
        b.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          openClip(c, lane);
        });
        let timer, x, y;
        b.addEventListener("pointerdown", (e) => {
          if (e.pointerType === "mouse") return;
          x = e.clientX;
          y = e.clientY;
          timer = setTimeout(() => {
            timer = null;
            openClip(c, lane);
          }, 550);
        });
        const cancel = () => {
          clearTimeout(timer);
          timer = null;
        };
        b.addEventListener("pointermove", (e) => {
          if (Math.abs(e.clientX - x) > 8 || Math.abs(e.clientY - y) > 8)
            cancel();
        });
        ["pointerup", "pointercancel", "dragstart"].forEach((type) =>
          b.addEventListener(type, cancel),
        );
        row.append(b);
      }
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        try {
          const data = JSON.parse(
            e.dataTransfer.getData("application/x-drumidi"),
          );
          const slot = row.querySelector(".bar-slot").getBoundingClientRect(),
            gap = 3,
            start = Math.floor((e.clientX - slot.left) / (slot.width + gap));
          place(data, lane, start);
        } catch {
          say("Choose a pattern from the library to place it.");
        }
      });
      timeline.append(row);
    });
  }
  function locate(id) {
    for (let lane = 0; lane < 3; lane++) {
      const clip = project.arrangement.lanes[lane].find((c) => c.id === id);
      if (clip) return { clip, lane };
    }
    return null;
  }
  function place(data, lane, start, copy = false) {
    const existing = data.id ? locate(data.id) : null;
    if (data.id && !existing) return false;
    if (
      !D.canPlace(
        project,
        lane,
        data.pattern,
        start,
        copy ? undefined : data.id,
      )
    ) {
      const msg = "Clip does not fit: choose empty bars within the timeline.";
      $("placement").textContent = msg;
      $("clip-error").textContent = msg;
      say(msg);
      return false;
    }
    if (existing && !copy)
      project.arrangement.lanes[existing.lane] = project.arrangement.lanes[
        existing.lane
      ].filter((c) => c.id !== data.id);
    project.arrangement.lanes[lane].push({
      id: existing && !copy ? data.id : crypto.randomUUID(),
      pattern: data.pattern,
      start,
    });
    changed(
      `${data.pattern} ${existing && !copy ? "moved" : "placed"} in lane ${laneLetter(lane)}, bar ${start + 1}`,
    );
    return true;
  }
  function openClip(c, lane) {
    if ($("clip-dialog").open) return;
    clipTarget = c.id;
    $("clip-title").textContent =
      `${c.pattern} · ${lengthText(project.patterns.find((p) => p.id === c.pattern).bars)}`;
    $("clip-lane").value = lane;
    $("clip-start").replaceChildren(
      ...Array.from({ length: project.arrangement.bars }, (_, i) =>
        option(i, `Bar ${i + 1}`),
      ),
    );
    $("clip-start").value = c.start;
    $("clip-error").textContent = "";
    $("clip-dialog").showModal();
  }
  function render() {
    renderPattern();
    renderArrangement();
    transport();
    cachedEvents = allEvents();
  }
  async function play() {
    if (audio.running || busy) {
      stop();
      say("Stopped · Reset to start");
      return;
    }
    busy = true;
    transport();
    audio.setMuted(project.drums);
    const token = ++audio.token;
    say("Loading acoustic kit…");
    try {
      await audio.init(project.drums);
      if (token !== audio.token) return;
      audio.start(allEvents(true), bars(), project.bpm);
      transport();
      say("Playing · Loop on");
    } catch (e) {
      if (token === audio.token) say("Could not start audio: " + e.message);
    } finally {
      if (token === audio.token) {
        busy = false;
        $("play").disabled = false;
        transport();
      }
    }
  }
  function setPage(next) {
    stop();
    page = next;
    $("pattern-page").hidden = page !== "pattern";
    $("arrangement-page").hidden = page !== "arrangement";
    $("pattern-tab").setAttribute("aria-pressed", String(page === "pattern"));
    $("arrangement-tab").setAttribute(
      "aria-pressed",
      String(page === "arrangement"),
    );
    render();
    say(
      "Stopped · " +
        (page === "pattern"
          ? "Selected pattern"
          : "All three arrangement lanes"),
    );
  }
  function download(data, name, type) {
    const url = URL.createObjectURL(new Blob([data], { type })),
      a = el("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $("length").append(...[1, 2, 3, 4].map((n) => option(n, lengthText(n))));
  $("arrangement-length").append(
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => option(n, lengthText(n))),
  );
  $("pattern-tab").onclick = () => setPage("pattern");
  $("arrangement-tab").onclick = () => setPage("arrangement");
  function selectPattern(index) {
    stop();
    selected = index;
    bar = 0;
    render();
  }
  $("pattern").onclick = () => $("pattern-picker").showModal();
  longPress($("pattern"), () => openPatternMenu(selected));
  $("pattern-menu").onclick = () => openPatternMenu(selected);
  $("library-menu").onclick = () =>
    openPatternMenu(project.patterns.findIndex((p) => p.id === library));
  $("length").onchange = (e) => {
    const previous = active().bars;
    active().bars = +e.target.value;
    try {
      D.validate(project);
    } catch {
      active().bars = previous;
      $("length").value = previous;
      say(
        "Pattern length would overlap clips or extend past the timeline. Move or remove those clips first.",
      );
      return;
    }
    bar = Math.min(bar, active().bars - 1);
    changed("Pattern length saved · Hidden notes retained");
  };
  $("previous").onclick = () => {
    bar = Math.max(0, bar - 1);
    renderPattern();
  };
  $("next").onclick = () => {
    bar = Math.min(active().bars - 1, bar + 1);
    renderPattern();
  };
  $("arrangement-length").onchange = (e) => {
    const previous = project.arrangement.bars;
    project.arrangement.bars = +e.target.value;
    try {
      D.validate(project);
    } catch {
      project.arrangement.bars = previous;
      $("arrangement-length").value = previous;
      say("Move or delete clips beyond the new timeline length first.");
      return;
    }
    changed("Timeline length saved");
  };
  $("add-drum").onclick = () => {
    const available = D.catalog.filter(
      (d) => !project.drums.some((a) => a.midi === d.midi),
    );
    $("drum-choice").replaceChildren(
      ...available.map((d) => option(d.midi, `${d.midi} · ${d.name}`)),
    );
    $("confirm-drum").disabled = !available.length;
    $("drum-dialog").showModal();
  };
  $("confirm-drum").onclick = () => {
    const d = D.catalog.find((d) => d.midi === +$("drum-choice").value);
    if (!d) return;
    project.drums.push({ ...d, muted: false });
    drum = d.midi;
    $("drum-dialog").close();
    changed(`${d.name} added`);
    $("drum-grid").scrollTop = $("drum-grid").scrollHeight;
  };
  $("play").onclick = play;
  function bpm(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 30 || n > 300) {
      $("bpm").value = project.bpm;
      say("Choose a BPM from 30 to 300.");
      return;
    }
    if (n === project.bpm) return;
    const wasPlaying = audio.running;
    project.bpm = n;
    changed("Tempo saved");
    if (wasPlaying) play();
  }
  $("bpm").onchange = (e) => bpm(e.target.value);
  $("bpm-down").onclick = () => bpm(Math.max(30, project.bpm - 1));
  $("bpm-up").onclick = () => bpm(Math.min(300, project.bpm + 1));
  $("export").onclick = () => {
    download(
      D.midi(project, page, selected),
      `DruMidi-${page === "pattern" ? active().id : "Arrangement"}.mid`,
      "audio/midi",
    );
    say("MIDI exported · GM channel 10 · 960 PPQ");
  };
  $("settings").onclick = () => {
    $("storage-status").textContent =
      storageWarning || "Automatic save is up to date in this browser.";
    $("project-dialog").showModal();
  };
  $("save-project").onclick = () => {
    download(
      JSON.stringify(project, null, 2),
      "DruMidi-project.json",
      "application/json",
    );
    say("JSON project downloaded");
  };
  $("load-project").onclick = () => $("project-file").click();
  $("project-file").onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.size > 32 * 1024 * 1024)
        throw new Error("Project file is too large (maximum 32 MB).");
      const candidate = D.validate(JSON.parse(await file.text()));
      if (
        !confirm(
          "Replace the current project with this file? Save Project first if you need a backup.",
        )
      )
        return;
      stop();
      project = candidate;
      clipboard = null;
      selected = bar = position = 0;
      drum = project.drums[0].midi;
      $("project-dialog").close();
      changed("Complete JSON project restored");
    } catch (err) {
      say("Could not load project: " + err.message);
      $("storage-status").textContent =
        "Could not load project: " + err.message;
    }
  };
  $("new-project").onclick = () => {
    if (
      !confirm(
        "Start a new project and replace the current session? Save Project first to keep a backup.",
      )
    )
      return;
    clipboard = null;
    project = D.fresh();
    selected = bar = position = 0;
    drum = 35;
    $("project-dialog").close();
    changed("New project ready");
  };
  for (const [id, copy] of [
    ["move-clip", false],
    ["copy-clip", true],
  ])
    $(id).onclick = () => {
      const found = locate(clipTarget);
      if (
        found &&
        place(found.clip, +$("clip-lane").value, +$("clip-start").value, copy)
      )
        $("clip-dialog").close();
    };
  $("delete-clip").onclick = () => {
    const found = locate(clipTarget);
    if (found) {
      project.arrangement.lanes[found.lane] = project.arrangement.lanes[
        found.lane
      ].filter((c) => c.id !== clipTarget);
      changed("Clip deleted");
    }
    $("clip-dialog").close();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
      say("Stopped while the app is in the background");
    }
  });
  window.addEventListener("pagehide", stop);
  // One bar spans the display; repetitions on either side show the loop seam.
  const canvas = $("rhythm"),
    ctx = canvas.getContext("2d");
  let cachedEvents = [];
  function draw() {
    const box = canvas.getBoundingClientRect(),
      ratio = window.devicePixelRatio || 1,
      w = box.width,
      h = box.height;
    if (
      canvas.width !== Math.round(w * ratio) ||
      canvas.height !== Math.round(h * ratio)
    ) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const current = audio.position(),
      total = bars() * 64,
      left = 30,
      right = w - 8,
      usable = right - left,
      pixel = usable / 64,
      head = left + usable * 0.47;
    ctx.font = "bold 11px system-ui";
    for (let lane = 0; lane < 3; lane++) {
      const laneY = h * (0.12 + lane * 0.29);
      ctx.fillStyle = ["#057deb", "#a75e13", "#23854e"][lane];
      ctx.beginPath();
      ctx.roundRect(0, laneY, 23, 22, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(laneLetter(lane), 7, laneY + 15);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, 0, usable, h);
    ctx.clip();
    const first = Math.floor(current - (head - left) / pixel),
      last = Math.ceil(current + (right - head) / pixel);
    for (let step = first; step <= last; step++) {
      const x = head + (step - current) * pixel;
      ctx.strokeStyle =
        step % 64 === 0
          ? "#cad4e2"
          : step % 8 === 0
            ? "#718094"
            : step % 2 === 0
              ? "#35404f"
              : "#222b36";
      ctx.lineWidth = step % 64 === 0 ? 1.3 : 0.6;
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.lineTo(x, h - 4);
      ctx.stroke();
    }
    for (const note of cachedEvents) {
      const start = Math.floor((first - note.step) / total),
        end = Math.ceil((last - note.step) / total);
      for (let loop = start; loop <= end; loop++) {
        const x = head + (note.step + loop * total - current) * pixel;
        if (x < left || x > right) continue;
        const index = project.drums.findIndex((d) => d.midi === note.drum),
          y = h * (0.16 + note.lane * 0.29) + (index % 5) * h * 0.035;
        ctx.fillStyle = ["#22b7f4", "#ffb75c", "#68df93"][note.lane];
        ctx.beginPath();
        ctx.arc(x, y, 2.4 + note.velocity / 127, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.strokeStyle = "#ff666a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(head, 3);
    ctx.lineTo(head, h - 1);
    ctx.stroke();
    ctx.fillStyle = "#ff666a";
    ctx.beginPath();
    ctx.moveTo(head - 7, 1);
    ctx.lineTo(head + 7, 1);
    ctx.lineTo(head, 11);
    ctx.fill();
    requestAnimationFrame(draw);
  }
  render();
  if (storageWarning) say(storageWarning);
  draw();
})();
