(function (root, factory) {
  const node = typeof module === "object";
  const url = node
    ? null
    : new URL("published-levels.json", document.currentScript.src).href;
  const api = factory(
    node ? require("./level-schema.js") : root.DFuzeSchema,
    node ? require("./published-levels.json") : null,
    url,
  );
  if (node) module.exports = api;
  else root.DFuzeLevels = api;
})(globalThis, (schema, initial, url) => {
  "use strict";
  let published = initial,
    loadError = null;
  function validatePublished(data) {
    return schema.requireValid(data);
  }

  async function loadPublished(fetcher = fetch) {
    try {
      const response = await fetcher(url, { cache: "no-store" });
      if (!response.ok)
        throw Error(`Published data request failed (${response.status}).`);
      const doc = validatePublished(await response.json());
      published = doc;
      loadError = null;
      return schema.clone(doc);
    } catch (e) {
      loadError = e;
      throw e;
    }
  }
  function publishedDocument() {
    if (loadError) throw loadError;
    if (!published) throw Error("Published configuration has not loaded.");
    return validatePublished(published);
  }
  function publishedLevel(number) {
    const level = publishedDocument().levels.find((l) => l.number === number);
    if (!level) throw Error(`Published Level ${number} is missing.`);
    return level;
  }
  function levelConfig(number) {
    const doc = publishedDocument(),
      level = doc.levels.find((l) => l.number === number);
    if (!level) throw Error(`Published Level ${number} is missing.`);
    return schema.toRuntime(
      level,
      level.seed,
      doc.assemblyProfiles,
      doc.ringProfiles,
    ).config;
  }
  return {
    loadPublished,
    validatePublished,
    publishedDocument,
    publishedLevel,
    levelConfig,
  };
});
