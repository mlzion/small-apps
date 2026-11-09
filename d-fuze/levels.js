(function (root, factory) {
  const api = factory(
    typeof module === "object"
      ? require("./level-schema.js")
      : root.DFuzeSchema,
    typeof module === "object"
      ? require("./published-levels.js")
      : root.DFuzePublished,
  );
  if (typeof module === "object") module.exports = api;
  else root.DFuzeLevels = api;
})(globalThis, (schema, published) => {
  "use strict";
  function publishedDocument() {
    const doc = schema.requireValid(published);
    if (
      doc.levels.length !== 6 ||
      doc.levels.some((l, i) => l.number !== i + 1 || l.ringCount > 2)
    )
      throw new Error(
        "Published configuration must contain playable Levels 1–6.",
      );
    return doc;
  }
  function publishedLevel(number) {
    const level = publishedDocument().levels.find((l) => l.number === number);
    if (!level) throw new Error(`Published Level ${number} is missing.`);
    return level;
  }
  function levelConfig(number) {
    const doc = publishedDocument(),
      level = doc.levels.find((l) => l.number === number);
    if (!level) throw new Error(`Published Level ${number} is missing.`);
    return schema.toRuntime(
      level,
      level.seed,
      doc.assemblyProfiles,
      doc.ringProfiles,
    ).config;
  }
  return { publishedDocument, publishedLevel, levelConfig };
});
