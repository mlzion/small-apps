"use strict";
(() => {
  const D = ChordMidi,
    $ = (id) => document.getElementById(id),
    KEY = "app-lab-chordmidi-v1",
    audio = new ChordAudio();
  let project = D.fresh(),
    activeLane = 0,
    selected = null,
    clipboard = null,
    pasting = false,
    warning = "",
    busy = false;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) project = D.validate(JSON.parse(raw));
  } catch (e) {
    warning =
      "Could not restore autosave: " + e.message + " Load a JSON backup.";
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
  function normalize() {
    const q = D.qualities.find((q) => q.id === b().quality);
    b().inversion = Math.min(
      b().inversion,
      (q.steps || q.intervals).length - 1,
    );
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
            `${D.degreeName(project.key, project.mode, i)} ${D.scale(project.key, project.mode)[i].name}`,
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
      options: () =>
        D.inversions.slice(
          0,
          (
            D.qualities.find((q) => q.id === b().quality).steps ||
            D.qualities.find((q) => q.id === b().quality).intervals
          ).length,
        ),
      value: () => b().inversion,
      set: (v) => (b().inversion = v),
    },
    {
      id: "octave",
      name: "Octave",
      options: () => ["1", "2", "3", "4", "5", "6"],
      value: () => b().octave - 1,
      set: (v) => (b().octave = v + 1),
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
      const n = conf.options().length;
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
          n === 2 &&
          ((i === 0 && offset === -1) || (i === 1 && offset === 1))
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
    const c = D.chord(project.key, project.mode, b());
    $("chord-name").textContent =
      `${c.name} · ${D.inversions[b().inversion]} · Oct ${b().octave}`;
    $("chord-notes").textContent =
      c.names.join(" – ") + `   /   MIDI ${c.pitches.join(", ")}`;
    $("rh").setAttribute("aria-pressed", String(activeLane === 0));
    $("lh").setAttribute("aria-pressed", String(activeLane === 1));
    document
      .querySelectorAll(".lane-label")
      .forEach((el, i) =>
        el.setAttribute("aria-pressed", String(i === activeLane)),
      );
    renderPassing();
  }
  function renderPassing() {
    $("note-source").value = project.passing.source;
    $("note-octave").value = project.passing.octave;
    $("passing-note").replaceChildren(
      ...D.passingOptions(project).map(
        (n, i) => new Option(n.label, String(i)),
      ),
    );
    $("passing-note").value = project.passing.index;
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
  for (let i = 1; i <= 6; i++)
    $("note-octave").append(new Option("Oct " + i, String(i)));
  $("note-source").onchange = () => {
    project.passing.source = $("note-source").value;
    project.passing.index = 0;
    changed();
    renderPassing();
  };
  $("passing-note").onchange = () => {
    project.passing.index = +$("passing-note").value;
    changed();
  };
  $("note-octave").onchange = () => {
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
        ? `${e.label} · ${e.duration}/8 · ${D.lanes[e.lane]}`
        : "Tap a pad to place. Tap an event to select.";
  }
  function selectEvent(e) {
    selected = e.id;
    project.key = e.key;
    project.mode = e.mode;
    if (e.lane < 2) {
      activeLane = e.lane;
      project.builders[activeLane] = { ...e.builder };
    } else {
      project.passing = { ...e.passing };
      if (e.passing.source === "chord" && e.sourceBuilder)
        project.builders[0] = { ...e.sourceBuilder };
    }
    normalize();
    persist();
    renderBuilder();
    renderEvents();
    editButtons();
  }
  function renderEvents() {
    document.querySelectorAll(".event").forEach((e) => e.remove());
    for (const e of project.events) {
      const el = document.createElement("div");
      el.className = "event" + (e.id === selected ? " selected" : "");
      el.dataset.id = e.id;
      el.dataset.lane = e.lane;
      el.style.left = e.start * 32 + 2 + "px";
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
        : D.makeEvent(project, lane, start, duration);
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
  for (const p of ChordPresets)
    $("instrument").append(
      new Option(
        `${String(p.program + 1).padStart(3, "0")} · ${p.name}`,
        p.program,
      ),
    );
  $("instrument").onchange = () => {
    project.program = +$("instrument").value;
    changed("Instrument updated for all lanes and Drop");
  };
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
        "TimGM6mb · SF2 ready · 128 General MIDI instruments";
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
  $("drop").onclick = () =>
    ready(() => {
      const c = D.chord(project.key, project.mode, b());
      audio.prepare(c.pitches, project.program);
      const time = audio.context.currentTime + 0.04;
      for (const pitch of c.pitches)
        audio.note(pitch, time, 1.2, project.program);
      say(`Audition: ${c.name}`);
    });
  $("play").onclick = () => {
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
        if (pos > sc.scrollLeft + sc.clientWidth - 20 || pos < sc.scrollLeft)
          sc.scrollLeft = Math.max(0, pos - 30);
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
      replace(D.fresh());
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
    $("instrument").value = project.program;
    transport();
  }
  render();
  if (warning) say(warning);
  else persist();
})();
