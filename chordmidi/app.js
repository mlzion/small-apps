"use strict";
(() => {
  const D = ChordMidi,
    instruments = ChordInstruments,
    LIBRARY_KEY = "app-lab-chordmidi-instruments-v1",
    $ = (id) => document.getElementById(id),
    KEY = "app-lab-chordmidi-v1",
    audio = new ChordAudio();
  let project = D.fresh(),
    activeLane = 0,
    selected = null,
    clipboard = null,
    pasting = false,
    warning = "",
    busy = false,
    restoredProject = false;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      project = D.validate(JSON.parse(raw));
      restoredProject = true;
    }
  } catch (e) {
    warning =
      "Could not restore autosave: " + e.message + " Load a JSON backup.";
  }
  let enabledInstruments = instruments.defaults.slice(),
    libraryWarning = "";
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw !== null)
      enabledInstruments = instruments.validateEnabled(JSON.parse(raw));
  } catch {
    libraryWarning =
      "Could not restore instrument choices. Using the 25 defaults for this session.";
  }
  if (!restoredProject && !enabledInstruments.includes(project.program)) {
    project.program = enabledInstruments[0];
    project.instrumentName = instruments.presets[project.program].name;
  }
  const say = (text) => {
    $("status").textContent = text;
  };
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(project));
      warning = "";
    } catch {
      warning =
        "Automatic saving unavailable. Use Save Project for a JSON backup.";
    }
    $("storage-status").textContent =
      warning ||
      "Autosaved in this browser. Save Project downloads a JSON backup.";
    if (warning) say(warning);
  }
  function stop() {
    audio.stop();
    busy = false;
    $("play").disabled = false;
    $("drop").disabled = false;
    transport();
  }
  function changed(message) {
    stop();
    persist();
    renderWheelLocks();
    if (message && !warning) say(message);
  }
  function transport() {
    $("play").innerHTML = audio.running
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3h5v18H5zM14 3h5v18h-5z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 3v18l15-9z"/></svg>';
    $("play").setAttribute("aria-label", audio.running ? "Pause" : "Play");
    $("play").setAttribute("aria-pressed", String(audio.running));
    $("loop").setAttribute("aria-pressed", String(project.loop));
    $("metronome").setAttribute("aria-pressed", String(project.metronome));
  }
  const b = () => project.builders[activeLane];
  const current = () => project.events.find((e) => e.id === selected);
  const songLocked = () => project.events.length > 0;
  const isSongWheel = (conf) => conf.id === "key" || conf.id === "mode";
  const octaves = (current) =>
    Array.from(new Set([1, 2, 3, 4, 5, 6, current]))
      .sort((a, b) => a - b)
      .map(String);
  function renderWheelLocks() {
    for (const id of ["key", "mode"]) {
      const el = $("wheel-" + id),
        locked = songLocked();
      el.classList.toggle("locked", locked);
      el.setAttribute("aria-disabled", String(locked));
      el.setAttribute("aria-readonly", String(locked));
      el.title = locked
        ? "Song Key/Mode are locked while notes exist. Use Setup → Transpose."
        : "";
    }
    $("transpose").disabled = !songLocked();
    renderContextHint();
  }
  function normalize() {
    b().inversion = Math.min(b().inversion, D.inversionCount(b().quality) - 1);
    project.passing.index = Math.min(
      project.passing.index,
      D.passingOptions(project).length - 1,
    );
  }
  const configs = [
    {
      id: "key",
      name: "Key",
      options: () => D.keys,
      value: () => project.key,
      set: (v) => (project.key = v),
    },
    {
      id: "mode",
      name: "Mode",
      options: () => ["Major", "Minor"],
      value: () => (project.mode === "Major" ? 0 : 1),
      set: (v) => (project.mode = ["Major", "Minor"][v]),
    },
    {
      id: "degree",
      name: "Interval",
      options: () =>
        Array.from(
          { length: 7 },
          (_, i) =>
            `${D.degreeName(D.contextFor(project, b()).key, D.contextFor(project, b()).mode, i)} ${D.scale(D.contextFor(project, b()).key, D.contextFor(project, b()).mode)[i].name}`,
        ),
      value: () => b().degree,
      set: (v) => (b().degree = v),
    },
    {
      id: "quality",
      name: "Chord",
      options: () => D.qualities.map((q) => q.name),
      value: () => D.qualities.findIndex((q) => q.id === b().quality),
      set: (v) => (b().quality = D.qualities[v].id),
    },
    {
      id: "inversion",
      name: "Inversion",
      options: () => D.inversions.slice(0, D.inversionCount(b().quality)),
      value: () => b().inversion,
      set: (v) => (b().inversion = v),
    },
    {
      id: "octave",
      name: "Octave",
      options: () => octaves(b().octave),
      value: () => octaves(b().octave).indexOf(String(b().octave)),
      set: (v) => (b().octave = +octaves(b().octave)[v]),
    },
  ];
  for (const conf of configs) {
    const group = document.createElement("div"),
      label = document.createElement("div"),
      el = document.createElement("div");
    label.className = "wheel-label";
    label.textContent = conf.name;
    el.className = "wheel";
    el.id = "wheel-" + conf.id;
    el.tabIndex = 0;
    el.setAttribute("role", "spinbutton");
    el.setAttribute("aria-label", conf.name);
    group.append(label, el);
    $("wheels").append(group);
    let gesture = null,
      lastWheel = 0;
    const move = (value) => {
      if (isSongWheel(conf) && songLocked()) {
        say("Song Key/Mode are locked. Use Setup → Transpose.");
        return;
      }
      const n = conf.options().length;
      if (n === 1) return;
      if (conf.id === "key" || conf.id === "mode") {
        for (const settings of [...project.builders, project.passing]) {
          delete settings.context;
          delete settings.voicing;
        }
      } else delete b().voicing;
      conf.set(((value % n) + n) % n);
      normalize();
      changed();
      renderBuilder();
    };
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (performance.now() - lastWheel < 100) return;
        lastWheel = performance.now();
        move(conf.value() + Math.sign(e.deltaY));
      },
      { passive: false },
    );
    el.addEventListener("keydown", (e) => {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        move(
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? conf.options().length - 1
              : conf.value() + (e.key === "ArrowDown" ? 1 : -1),
        );
      }
    });
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (isSongWheel(conf) && songLocked()) {
        e.preventDefault();
        return;
      }
      el.setPointerCapture(e.pointerId);
      gesture = {
        y: e.clientY,
        value: conf.value(),
        moved: false,
        slot: Math.floor(
          (e.clientY - el.getBoundingClientRect().top) / (el.clientHeight / 3),
        ),
      };
    });
    el.addEventListener("pointermove", (e) => {
      if (!gesture) return;
      const delta = gesture.y - e.clientY,
        row = el.clientHeight / 3;
      if (Math.abs(delta) > 7) gesture.moved = true;
      const value = gesture.value + Math.round(delta / row),
        n = conf.options().length;
      const next = ((value % n) + n) % n;
      if (next !== conf.value()) move(next);
    });
    el.addEventListener("pointerup", () => {
      if (!gesture) return;
      if (!gesture.moved && gesture.slot !== 1) {
        const n = conf.options().length;
        if (n === 2) move(1 - conf.value());
        else move(conf.value() + (gesture.slot === 0 ? -1 : 1));
      }
      gesture = null;
    });
    el.addEventListener("pointercancel", () => (gesture = null));
  }
  function renderBuilder() {
    normalize();
    for (const conf of configs) {
      const el = $("wheel-" + conf.id),
        opts = conf.options(),
        i = conf.value(),
        n = opts.length;
      el.replaceChildren();
      for (const offset of [-1, 0, 1]) {
        const d = document.createElement("div");
        d.className = "wheel-option" + (offset === 0 ? " selected" : "");
        if (
          (n === 1 && offset !== 0) ||
          (n === 2 && ((i === 0 && offset === -1) || (i === 1 && offset === 1)))
        ) {
          d.classList.add("blank");
          d.textContent = " ";
        } else d.textContent = opts[(i + offset + n) % n];
        el.append(d);
      }
      el.setAttribute("aria-valuemin", "0");
      el.setAttribute("aria-valuemax", String(n - 1));
      el.setAttribute("aria-valuenow", String(i));
      el.setAttribute("aria-valuetext", opts[i]);
    }
    const c = D.builderChord(project, b());
    $("chord-name").textContent =
      `${c.name} · ${D.inversions[b().inversion]} · Oct ${b().octave}`;
    $("chord-notes").textContent =
      (b().quality === "octave" || b().voicing ? c.noteLabels : c.names).join(
        " – ",
      ) + `   /   MIDI ${c.pitches.join(", ")}`;
    renderWheelLocks();
    $("rh").setAttribute("aria-pressed", String(activeLane === 0));
    $("lh").setAttribute("aria-pressed", String(activeLane === 1));
    document
      .querySelectorAll(".lane-label")
      .forEach((el, i) =>
        el.setAttribute("aria-pressed", String(i === activeLane)),
      );
    renderPassing();
    editButtons();
  }
  function renderContextHint() {
    const c = D.builderChord(project, b());
    const foreign =
      c.context.key !== project.key || c.context.mode !== project.mode;
    $("builder-context").textContent = !c.templateMatches
      ? `Stored voicing; wheels show its template. Builder ${D.keys[c.context.key]} ${c.context.mode} · Song ${D.keys[project.key]} ${project.mode}.`
      : foreign
        ? `Builder ${D.keys[c.context.key]} ${c.context.mode} · Song ${D.keys[project.key]} ${project.mode}. ${songLocked() ? "Use Setup → Transpose for a new song key." : "Key/Mode wheel edits use the song key."}`
        : "◇ Diatonic to key · Drop auditions · RH / LH retain their own voicings";
  }
  function renderPassing() {
    const scaleContext = D.contextFor(project, project.passing),
      rhContext = D.contextFor(project, project.builders[0]);
    const suffix = (c) =>
      c.key !== project.key || c.mode !== project.mode
        ? ` · ${D.keys[c.key]} ${c.mode}`
        : "";
    $("note-source").options[0].textContent =
      "Scale notes" +
      (project.passing.source === "scale" ? suffix(scaleContext) : "");
    $("note-source").options[1].textContent =
      "RH chord tones" + suffix(rhContext);
    $("note-source").value = project.passing.source;
    $("note-octave").replaceChildren(
      ...octaves(project.passing.octave).map((v) => new Option("Oct " + v, v)),
    );
    $("note-octave").value = project.passing.octave;
    $("passing-note").replaceChildren(
      ...D.passingOptions(project).map(
        (n, i) => new Option(n.label, String(i)),
      ),
    );
    if (project.passing.voicing) {
      $("passing-note").append(
        new Option("Stored " + project.passing.voicing.label, "stored"),
      );
      $("passing-note").value = "stored";
    } else $("passing-note").value = project.passing.index;
  }
  function switchLane(i) {
    activeLane = i;
    renderBuilder();
  }
  $("rh").onclick = () => switchLane(0);
  $("lh").onclick = () => switchLane(1);
  document.querySelectorAll(".lane-label").forEach(
    (el, i) =>
      (el.onclick = () => {
        if (i < 2) switchLane(i);
        else $("passing-note").focus();
      }),
  );
  $("note-source").onchange = () => {
    delete project.passing.context;
    delete project.passing.voicing;
    project.passing.source = $("note-source").value;
    project.passing.index = 0;
    changed();
    renderPassing();
  };
  $("passing-note").onchange = () => {
    if ($("passing-note").value === "stored") return;
    delete project.passing.voicing;
    project.passing.index = +$("passing-note").value;
    changed();
    renderPassing();
  };
  $("note-octave").onchange = () => {
    delete project.passing.voicing;
    project.passing.octave = +$("note-octave").value;
    changed();
    renderPassing();
  };
  function editButtons() {
    const e = current();
    $("copy").disabled = !e;
    $("paste").disabled = !clipboard;
    $("paste").setAttribute("aria-pressed", String(pasting));
    $("selection-info").textContent = pasting
      ? "Tap an empty pad to paste copied pitches and length."
      : e
        ? `${e.label} · ${e.duration}/8 · ${D.lanes[e.lane]}${e.key !== project.key || e.mode !== project.mode ? ` · Created in ${D.keys[e.key]} ${e.mode}; song ${D.keys[project.key]} ${project.mode}` : ""}`
        : "Tap a pad to place. Tap an event to select.";
  }
  function selectEvent(e) {
    selected = e.id;
    if (e.lane < 2) {
      activeLane = e.lane;
      project.builders[activeLane] = D.restoreBuilder(project, e);
    } else {
      if (e.passing.source === "chord" && e.sourceBuilder) {
        const { context, voicing, ...source } = e.sourceBuilder;
        if (e.key !== project.key || e.mode !== project.mode)
          source.context = { key: e.key, mode: e.mode };
        project.builders[0] = source;
      }
      project.passing = D.restorePassing(project, e);
    }
    normalize();
    persist();
    renderBuilder();
    renderEvents();
    editButtons();
    if (e.lane < 2) auditionChord(e.pitches, e.label);
  }
  function renderEvents() {
    document.querySelectorAll(".event").forEach((e) => e.remove());
    for (const e of project.events) {
      const el = document.createElement("div");
      el.className = "event" + (e.id === selected ? " selected" : "");
      el.dataset.id = e.id;
      el.dataset.lane = e.lane;
      el.style.left = e.start * 32 + "px";
      el.style.width = e.duration * 32 - 4 + "px";
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute(
        "aria-label",
        `${e.label}, ${D.lanes[e.lane]}, step ${e.start + 1}, duration ${e.duration} eighth notes`,
      );
      const label = document.createElement("span");
      label.className = "event-label";
      label.textContent = e.label;
      const handle = document.createElement("span");
      handle.className = "resize";
      handle.setAttribute("aria-hidden", "true");
      el.append(label, handle);
      $("lane-" + e.lane).append(el);
      el.onkeydown = (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          selectEvent(e);
        }
        if (ev.key === "Delete") {
          ev.preventDefault();
          deleteEvent(e);
        }
        if (ev.shiftKey && ["ArrowLeft", "ArrowRight"].includes(ev.key)) {
          ev.preventDefault();
          e.duration = Math.max(
            1,
            Math.min(
              D.totalSteps(project) - e.start,
              e.duration + (ev.key === "ArrowRight" ? 1 : -1),
            ),
          );
          changed("Event resized");
          renderEvents();
          editButtons();
        }
      };
    }
  }
  function renderGrid() {
    $("bar-count").textContent = project.bars;
    $("meter").value = project.meter;
    $("less-bars").disabled = project.bars <= 1;
    $("more-bars").disabled = project.bars >= 8;
    $("ruler").replaceChildren();
    $("lanes").replaceChildren();
    const per = D.stepsPerBar(project.meter),
      total = D.totalSteps(project);
    for (let i = 0; i < project.bars; i++) {
      const el = document.createElement("div");
      el.className = "bar-marker";
      el.style.width = per * 32 + "px";
      el.textContent = i + 1;
      $("ruler").append(el);
    }
    for (let lane = 0; lane < 3; lane++) {
      const row = document.createElement("div");
      row.className = "lane";
      row.id = "lane-" + lane;
      row.dataset.lane = lane;
      for (let start = 0; start < total; start++) {
        const el = document.createElement("div");
        el.className =
          "pad" +
          (start % per === 0 ? " bar-start" : "") +
          (start % (project.meter === "6/8" ? 3 : 2) === 0 ? " beat" : "");
        el.dataset.start = start;
        el.dataset.lane = lane;
        el.tabIndex = 0;
        el.setAttribute("role", "button");
        el.setAttribute(
          "aria-label",
          `Place ${lane === 2 ? "passing note" : "chord"} in ${D.lanes[lane]}, bar ${Math.floor(start / per) + 1}, eighth ${(start % per) + 1}`,
        );
        el.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            place(lane, start, 1);
          }
        };
        row.append(el);
      }
      $("lanes").append(row);
    }
    renderEvents();
    editButtons();
  }
  function place(lane, start, duration) {
    if (pasting && clipboard && (lane === 2) !== (clipboard.lane === 2)) {
      say(
        "Paste chord events into RH/LH, and passing notes into Passing Notes.",
      );
      return;
    }
    const e =
      pasting && clipboard
        ? {
            ...structuredClone(clipboard),
            id: crypto.randomUUID(),
            lane,
            start,
          }
        : (() => {
            const note = D.makeEvent(project, lane, start, duration);
            if (!note.pitches.every((p) => p >= 0 && p <= 127)) return null;
            return note;
          })();
    if (!e) {
      say(
        "The builder is outside MIDI 0–127. Choose another octave before placing.",
      );
      return;
    }
    if (e.start + e.duration > D.totalSteps(project)) {
      say(
        "This event would extend past the arrangement. Choose an earlier pad or add bars.",
      );
      return;
    }
    project.events.push(e);
    selected = e.id;
    pasting = false;
    changed("Event placed · pitches stored");
    renderEvents();
    editButtons();
  }
  function deleteEvent(e) {
    project.events = project.events.filter((n) => n.id !== e.id);
    if (selected === e.id) selected = null;
    changed("Event deleted");
    renderEvents();
    editButtons();
  }
  // Native touch scrolling wins until a stationary hold arms duration editing.
  let gesture = null;
  function cancelGesture() {
    if (gesture) clearTimeout(gesture.timer);
    gesture = null;
  }
  $("lanes").addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const eventEl = e.target.closest(".event"),
      pad = e.target.closest(".pad");
    if (!eventEl && !pad) return;
    const lane = +(eventEl || pad).dataset.lane,
      ev = eventEl && project.events.find((n) => n.id === eventEl.dataset.id),
      resize = !!e.target.closest(".resize");
    gesture = {
      id: e.pointerId,
      downTime: e.timeStamp,
      x: e.clientX,
      y: e.clientY,
      lane,
      start: ev ? ev.start : +pad.dataset.start,
      event: ev,
      resize,
      armed: resize || (e.pointerType === "mouse" && !ev),
      moved: false,
      deleted: false,
      duration: ev?.duration || 1,
      scroll: $("timeline-scroll").scrollLeft,
    };
    const g = gesture;
    if (resize) {
      e.preventDefault();
      $("lanes").setPointerCapture(e.pointerId);
    }
    g.timer = setTimeout(
      () => {
        if (gesture !== g || g.moved) return;
        if (g.event) {
          g.deleted = true;
          deleteEvent(g.event);
        } else {
          g.armed = true;
          $("lanes").setPointerCapture(g.id);
          say("Drag right to set duration, then release.");
        }
      },
      ev ? 650 : 260,
    );
  });
  $("lanes").addEventListener("pointermove", (e) => {
    const g = gesture;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (Math.abs(dx) > 7 || Math.abs(dy) > 7) {
      g.moved = true;
      clearTimeout(g.timer);
    }
    if (g.moved && !g.armed) return;
    if (g.armed && g.moved) {
      if (Math.abs(dy) > 45 && !g.resize) {
        cancelGesture();
        return;
      }
      e.preventDefault();
      const delta = Math.round(dx / 32);
      g.duration = Math.max(
        1,
        Math.min(
          D.totalSteps(project) - g.start,
          (g.resize ? g.event.duration : 1) + delta,
        ),
      );
      if (g.resize) {
        const el = document.querySelector(`.event[data-id="${g.event.id}"]`);
        el.style.width = g.duration * 32 - 4 + "px";
      }
      say(`Duration: ${g.duration} eighth notes`);
    }
  });
  $("lanes").addEventListener("pointerup", (e) => {
    const g = gesture;
    if (!g || g.id !== e.pointerId) return;
    clearTimeout(g.timer);
    gesture = null;
    if (g.deleted || Math.abs($("timeline-scroll").scrollLeft - g.scroll) > 4)
      return;
    // Input timestamps still distinguish a hold if a busy main thread delays
    // the deletion timer until after pointerup is queued.
    if (g.event && !g.moved && e.timeStamp - g.downTime >= 650) {
      deleteEvent(g.event);
      return;
    }
    if (g.resize) {
      if (!g.moved) {
        selectEvent(g.event);
        return;
      }
      g.event.duration = g.duration;
      selected = g.event.id;
      changed("Event resized");
      renderEvents();
      editButtons();
    } else if (g.event && !g.moved) selectEvent(g.event);
    else if (!g.event && (!g.moved || g.armed))
      place(g.lane, g.start, g.duration);
  });
  $("lanes").addEventListener(
    "touchmove",
    (e) => {
      if (gesture?.armed) e.preventDefault();
    },
    { passive: false },
  );
  $("lanes").addEventListener("pointercancel", () => {
    cancelGesture();
    renderEvents();
  });
  $("lanes").addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });
  $("copy").onclick = () => {
    if (current()) {
      clipboard = structuredClone(current());
      pasting = false;
      editButtons();
      say(
        "Copied pitches, voicing and duration. Tap Paste, then an empty pad.",
      );
    }
  };
  $("paste").onclick = () => {
    pasting = !pasting;
    editButtons();
  };
  function length(bars, meter) {
    const total = bars * D.stepsPerBar(meter);
    if (project.events.some((e) => e.start + e.duration > total)) {
      say(
        "Existing events extend past that length. Resize or delete them before shortening.",
      );
      $("meter").value = project.meter;
      return;
    }
    project.bars = bars;
    project.meter = meter;
    changed("Grid updated · eighth-note resolution");
    renderGrid();
  }
  $("less-bars").onclick = () =>
    length(Math.max(1, project.bars - 1), project.meter);
  $("more-bars").onclick = () =>
    length(Math.min(8, project.bars + 1), project.meter);
  $("meter").onchange = () => length(project.bars, $("meter").value);
  function renderInstrument() {
    const programs = enabledInstruments.slice();
    if (!programs.includes(project.program)) programs.push(project.program);
    programs.sort((a, b) => a - b);
    $("instrument").replaceChildren(
      ...programs.map(
        (program) =>
          new Option(
            `${String(program + 1).padStart(3, "0")} · ${instruments.presets[program].name}${enabledInstruments.includes(program) ? "" : " · Project preview"}`,
            String(program),
          ),
      ),
    );
    $("instrument").value = String(project.program);
  }
  function chooseInstrument(program) {
    project.program = program;
    project.instrumentName = instruments.presets[program].name;
    changed("Instrument updated for all lanes and Drop");
    renderInstrument();
  }
  function saveInstrumentPreferences() {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(enabledInstruments));
      libraryWarning = "";
    } catch {
      libraryWarning =
        "Instrument choices apply for this session, but could not be saved in this browser.";
    }
  }
  function renderInstrumentLibrary(
    message = "Instrument choices apply across projects in this browser.",
  ) {
    $("enabled-count").textContent = `${enabledInstruments.length} enabled`;
    document
      .querySelectorAll(".instrument-choice input")
      .forEach(
        (input) => (input.checked = enabledInstruments.includes(+input.value)),
      );
    instruments.categories.forEach((category, i) => {
      document.querySelectorAll(".category-count")[i].textContent =
        `${category.programs.filter((p) => enabledInstruments.includes(p)).length}/8`;
    });
    $("library-status").textContent = libraryWarning || message;
  }
  for (const category of instruments.categories) {
    const details = document.createElement("details");
    details.className = "instrument-category";
    const summary = document.createElement("summary"),
      title = document.createElement("span"),
      count = document.createElement("small");
    title.className = "category-name";
    title.textContent = category.name;
    count.className = "category-count";
    summary.append(title, count);
    details.append(summary);
    for (const program of category.programs) {
      const label = document.createElement("label");
      label.className = "instrument-choice";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = program;
      input.id = "instrument-" + program;
      const text = document.createElement("span");
      text.textContent = `${program + 1}. ${instruments.presets[program].name}`;
      label.append(input, text);
      details.append(label);
      input.onchange = () => {
        if (!input.checked && enabledInstruments.length === 1) {
          input.checked = true;
          renderInstrumentLibrary(
            "At least one instrument must remain enabled.",
          );
          return;
        }
        enabledInstruments = instruments.validateEnabled(
          input.checked
            ? [...enabledInstruments, program]
            : enabledInstruments.filter((p) => p !== program),
        );
        saveInstrumentPreferences();
        // A hidden instrument restored from a project stays available until the
        // user explicitly disables it or chooses a different preview instrument.
        if (!input.checked && project.program === program)
          chooseInstrument(enabledInstruments[0]);
        else renderInstrument();
        renderInstrumentLibrary();
      };
    }
    $("instrument-categories").append(details);
  }
  $("restore-instruments").onclick = () => {
    enabledInstruments = instruments.defaults.slice();
    saveInstrumentPreferences();
    if (!enabledInstruments.includes(project.program))
      chooseInstrument(enabledInstruments[0]);
    else renderInstrument();
    renderInstrumentLibrary("The original 25 instruments have been restored.");
  };
  $("instrument").onchange = () => chooseInstrument(+$("instrument").value);
  renderInstrumentLibrary();
  $("bpm").onchange = () => {
    const v = +$("bpm").value;
    if (Number.isInteger(v) && v >= 30 && v <= 300) {
      project.bpm = v;
      changed("Tempo updated");
    } else say("BPM must be a whole number from 30 to 300.");
    $("bpm").value = project.bpm;
  };
  $("loop").onclick = () => {
    project.loop = !project.loop;
    if (audio.running) audio.project.loop = project.loop;
    persist();
    transport();
  };
  $("metronome").onclick = () => {
    project.metronome = !project.metronome;
    if (audio.running) audio.project.metronome = project.metronome;
    persist();
    transport();
  };
  async function ready(action) {
    if (busy) return;
    busy = true;
    const token = audio.generation;
    $("play").disabled = true;
    $("drop").disabled = true;
    $("audio-status").textContent = "Loading SF2 instrument bank…";
    try {
      await audio.init();
      $("audio-status").textContent =
        "TimGM6mb · SF2 ready · Instrument library in Setup";
      if (token === audio.generation) action();
    } catch (e) {
      say("Could not start audio: " + e.message + ". Try again.");
      $("audio-status").textContent = "Audio unavailable · retry Drop or Play";
    } finally {
      busy = false;
      $("play").disabled = false;
      $("drop").disabled = false;
      transport();
    }
  }
  async function auditionChord(pitches, label, duration = 0.8) {
    if (!audio.font)
      $("audio-status").textContent = "Loading SF2 instrument bank…";
    try {
      const played = await audio.audition(pitches, project.program, duration);
      if (played) {
        $("audio-status").textContent =
          "TimGM6mb · SF2 ready · Instrument library in Setup";
        say(`Audition: ${label}`);
      }
    } catch (error) {
      say("Could not start audio: " + error.message + ". Try again.");
      $("audio-status").textContent = "Audio unavailable · retry Drop or Play";
    }
  }
  $("drop").onclick = () => {
    const c = D.builderChord(project, b());
    if (!c.pitches.every((p) => p >= 0 && p <= 127)) {
      say(
        "The builder is outside MIDI 0–127. Choose another octave before Drop.",
      );
      return;
    }
    auditionChord(c.pitches, c.name, 1.2);
  };
  $("play").onclick = () => {
    audio.cancelAudition();
    if (audio.running) {
      audio.pause();
      transport();
    } else ready(() => audio.start(project, audio.offset));
  };
  $("stop").onclick = () => {
    stop();
    say("Stopped");
  };
  $("rewind").onclick = () => {
    const playing = audio.running;
    stop();
    if (playing) audio.start(project, 0);
    transport();
    $("timeline-scroll").scrollLeft = 0;
  };
  audio.onEnd = transport;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  window.addEventListener("pagehide", stop);
  function frame() {
    const cursor = $("cursor");
    if (audio.running || audio.offset > 0) {
      const pos = audio.position() * 32;
      cursor.style.display = "block";
      cursor.style.left = pos + "px";
      if (audio.running) {
        const sc = $("timeline-scroll");
        if (pos < sc.scrollLeft) sc.scrollLeft = Math.max(0, pos - 30);
        else if (pos > sc.scrollLeft + sc.clientWidth - 20)
          sc.scrollLeft = Math.max(0, pos - sc.clientWidth + 20);
      }
    } else cursor.style.display = "none";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  $("fullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else
        say(
          "Fullscreen is unavailable in this browser. Try adding ChordMidi to your home screen.",
        );
    } catch (e) {
      say("Could not enter fullscreen: " + e.message);
    }
  };
  function download(data, name, type) {
    const url = URL.createObjectURL(new Blob([data], { type })),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function name() {
    project.name = $("project-name").value.trim() || "ChordMidi Project";
    $("project-name").value = project.name;
    persist();
  }
  const stem = () =>
    project.name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/[. ]+$/g, "")
      .slice(0, 120) || "ChordMidi";
  $("setup").onclick = () => {
    $("project-name").value = project.name;
    $("storage-status").textContent =
      warning ||
      "Autosaved in this browser. Save Project downloads a JSON backup.";
    $("setup-dialog").showModal();
  };
  $("close-setup").onclick = () => $("setup-dialog").close();
  $("project-name").onchange = name;
  $("save-project").onclick = () => {
    name();
    download(
      JSON.stringify(project, null, 2),
      stem() + ".json",
      "application/json",
    );
    say("Project backup downloaded");
  };
  $("export-midi").onclick = () => {
    name();
    download(D.midi(project), stem() + ".mid", "audio/midi");
    say("MIDI downloaded · three separate tracks");
  };
  for (const [i, key] of D.keys.entries())
    $("transpose-key").append(new Option(key, String(i)));
  function transposePreview() {
    const destination = +$("transpose-key").value,
      direction = $("transpose-direction").value;
    const shift = D.transposeShift(project.key, destination, direction);
    $("transpose-preview").textContent =
      `${D.keys[destination]} ${project.mode} · ${shift >= 0 ? "+" : ""}${shift} semitones`;
    try {
      D.transpose(project, destination, direction);
      $("transpose-error").textContent = "";
      $("apply-transpose").disabled = false;
    } catch (error) {
      $("transpose-error").textContent = error.message;
      $("apply-transpose").disabled = true;
    }
  }
  $("transpose").onclick = () => {
    if (!songLocked()) return;
    $("transpose-current").textContent =
      `${D.keys[project.key]} ${project.mode}`;
    $("transpose-key").value = String(project.key);
    $("transpose-direction").value = "shortest";
    transposePreview();
    $("transpose-dialog").showModal();
  };
  $("transpose-key").onchange = transposePreview;
  $("transpose-direction").onchange = transposePreview;
  $("cancel-transpose").onclick = () => $("transpose-dialog").close();
  $("transpose-form").onsubmit = (event) => {
    event.preventDefault();
    try {
      const next = D.transpose(
        project,
        +$("transpose-key").value,
        $("transpose-direction").value,
      );
      stop();
      project = next;
      pasting = false;
      persist();
      render();
      $("transpose-dialog").close();
      $("setup-dialog").close();
      say(
        "Arrangement transposed · " + D.keys[project.key] + " " + project.mode,
      );
    } catch (error) {
      $("transpose-error").textContent = error.message;
      $("apply-transpose").disabled = true;
    }
  };
  function replace(p) {
    stop();
    project = p;
    selected = null;
    clipboard = null;
    pasting = false;
    activeLane = 0;
    persist();
    render();
    $("setup-dialog").close();
    $("timeline-scroll").scrollLeft = 0;
  }
  $("new-project").onclick = () => {
    if (
      confirm(
        "Start a new project? Save Project first to keep a backup of this arrangement.",
      )
    ) {
      const fresh = D.fresh();
      if (!enabledInstruments.includes(fresh.program)) {
        fresh.program = enabledInstruments[0];
        fresh.instrumentName = instruments.presets[fresh.program].name;
      }
      replace(fresh);
      say("New project");
    }
  };
  $("load-project").onclick = () => $("project-file").click();
  $("project-file").onchange = async () => {
    const file = $("project-file").files[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw Error("Project file exceeds 2 MB");
      const p = D.validate(JSON.parse(await file.text()));
      if (
        confirm(
          "Replace this project with “" +
            p.name +
            "”? Save Project first to keep a backup.",
        )
      ) {
        replace(p);
        say("Project loaded");
      }
    } catch (e) {
      $("storage-status").textContent = "Could not load project: " + e.message;
      say("Could not load project: " + e.message);
    } finally {
      $("project-file").value = "";
    }
  };
  function render() {
    renderBuilder();
    renderGrid();
    $("bpm").value = project.bpm;
    renderInstrument();
    transport();
  }
  render();
  if (warning) say(warning);
  else persist();
})();
