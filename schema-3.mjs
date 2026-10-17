// Schema-3 contract vendored from Dueling-Book-Enhancer/enhancer-core.js.
// Includes historical prerequisites and no-zone resolution policy (2026-10-17).
const copy = value => JSON.parse(JSON.stringify(value));
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const AUTOMATION_FORMATS = ["ar", "au", "er", "eu", "gr", "gu", "yu", "cu", "su", "ru", "uu", "tu", "so"];
  function validateAutomationList(value) {
    const keys = (object, allowed) => isObject(object) && Object.keys(object).every(key => allowed.includes(key));
    const text = (value, limit = 160) => typeof value === "string" && value.trim().length > 0 && value.length <= limit;
    const identities = new Map();
    const card = value => {
      if (!keys(value, ["passcode", "id", "name"]) || !text(value.name)) return false;
      const hasPasscode = Object.hasOwn(value, "passcode"), hasId = Object.hasOwn(value, "id");
      if (hasPasscode === hasId || (hasPasscode ? typeof value.passcode !== "string" || !/^\d{8}$/.test(value.passcode) || value.passcode === "00000000" :
        !Number.isSafeInteger(value.id) || value.id <= 0)) return false;
      const key = hasPasscode ? "Passcode " + value.passcode : "DB ID " + value.id;
      const known = identities.get(key);
      if (known && known !== value.name) {
        throw new Error(key + " belongs to \"" + known + "\", not \"" + value.name + "\".");
      }
      identities.set(key, value.name);
      return true;
    };
    const rule = value => keys(value, ["id", "card", "label", "requires", "activation", "resolution"]) &&
      text(value.id, 80) && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value.id) && card(value.card) && text(value.label) &&
      keys(value.requires, ["sourceZone", "ownTurn", "phases", "absentFaceUpCards"]) && value.requires.sourceZone === "graveyard" &&
      value.requires.ownTurn === true && Array.isArray(value.requires.phases) && value.requires.phases.length > 0 &&
      value.requires.phases.length <= 6 && value.requires.phases.every(phase => ["DP", "SP", "M1", "BP", "M2", "EP"].includes(phase)) &&
      (value.requires.absentFaceUpCards === undefined || (Array.isArray(value.requires.absentFaceUpCards) &&
        value.requires.absentFaceUpCards.length > 0 && value.requires.absentFaceUpCards.length <= 10 && value.requires.absentFaceUpCards.every(card))) &&
      Array.isArray(value.activation) && value.activation.length === 1 &&
      keys(value.activation[0], ["op", "card"]) && value.activation[0].op === "banish" && value.activation[0].card === "source" &&
      Array.isArray(value.resolution) && value.resolution.length === 1 &&
      keys(value.resolution[0], ["op", "from", "card", "positions", "onNoMonsterZone"]) && value.resolution[0].op === "special-summon" &&
      (value.resolution[0].onNoMonsterZone === undefined || value.resolution[0].onNoMonsterZone === "destroy-to-graveyard") &&
      value.resolution[0].from === "deck" && card(value.resolution[0].card) &&
      Array.isArray(value.resolution[0].positions) && value.resolution[0].positions.length > 0 &&
      value.resolution[0].positions.length <= 2 && value.resolution[0].positions.every(position => ["ATK", "DEF"].includes(position)) &&
      new Set(value.resolution[0].positions).size === value.resolution[0].positions.length;
    if (!keys(value, ["schemaVersion", "id", "name", "version", "formats", "enabled", "rules"]) || value.schemaVersion !== 3 ||
        typeof value.id !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value.id) ||
        typeof value.name !== "string" || !value.name.trim() || value.name.length > 80 ||
        typeof value.version !== "string" || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value.version) ||
        !Array.isArray(value.formats) || !value.formats.length || value.formats.length > AUTOMATION_FORMATS.length ||
        value.formats.some(format => !AUTOMATION_FORMATS.includes(format)) ||
        !Array.isArray(value.rules) || !value.rules.length || value.rules.length > 100 ||
        value.rules.some(candidate => !rule(candidate)) ||
        new Set(value.rules.map(rule => rule.id)).size !== value.rules.length) {
      throw new Error("Invalid rules list. Use schema 3 with an eight-digit passcode (or positive Duelingbook card ID) and name, valid formats, prerequisites, and supported action steps.");
    }
    // Reject extensions to the schema rather than silently discarding instructions.
    if (value.enabled !== undefined && typeof value.enabled !== "boolean") throw new Error("Invalid list enablement.");
    return { schemaVersion: 3, id: value.id, name: value.name.trim(), version: value.version,
      formats: [...new Set(value.formats)], enabled: value.enabled === true,
      rules: copy(value.rules) };
  }
  function importAutomationList(text) {
    if (typeof text !== "string" || text.length > 65536) throw new Error("Rules list exceeds 64 KB.");
    const list = validateAutomationList(JSON.parse(text));
    list.enabled = false;
    return list;
  }
  function exportAutomationList(list) {
    const { enabled, ...definition } = validateAutomationList(list);
    return JSON.stringify(definition, null, 2);
  }


export default { validateAutomationList, importAutomationList, exportAutomationList };
