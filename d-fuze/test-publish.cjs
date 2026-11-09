"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  S = require("./level-schema.js"),
  L = require("./levels.js"),
  { Game } = require("./engine.js");
(async () => {
  const original = fs.readFileSync(
    `${__dirname}/published-levels.json`,
    "utf8",
  );
  const doc = L.publishedDocument();
  doc.levels[0].timer = 81;
  doc.ringProfiles[0].keyframes[1][1] = -37;
  const exported = S.exportJSON(doc);
  assert.deepEqual(L.validatePublished(JSON.parse(exported)), doc);
  let request;
  await L.loadPublished(async (url, options) => {
    request = options;
    return { ok: true, json: async () => JSON.parse(exported) };
  });
  assert.equal(request.cache, "no-store");
  const game = new Game();
  game.newGame();
  assert.equal(game.config.time, 81);
  assert.equal(L.publishedDocument().ringProfiles[0].keyframes[1][1], -37);
  assert.equal(
    fs.readFileSync(`${__dirname}/published-levels.json`, "utf8"),
    original,
  );
  const bad = S.clone(doc);
  bad.levels[0].ammo = 0;
  assert.throws(() => S.exportJSON(bad));
  assert.throws(() => L.validatePublished(bad));
  await assert.rejects(() =>
    L.loadPublished(async () => ({ ok: false, status: 404 })),
  );
  assert.throws(() => L.publishedDocument(), /404/);
  assert.equal(S.saveDraft, undefined);
  assert.equal(S.loadDraft, undefined);
  assert.equal(S.DRAFT_KEY, undefined);
  assert.equal(S.SESSION_KEY, undefined);
  console.log(
    "PASS: complete exported JSON loads directly in published loader/game, fresh requests, no disk mutation, invalid data rejected/no fallback, draft APIs absent",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
