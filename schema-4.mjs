// Generated from the extension contract. Run scripts/sync-automation-contracts.mjs in the extension repository.
const copy = value => JSON.parse(JSON.stringify(value));
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const AUTOMATION_FORMATS = ["ar", "au", "er", "eu", "gr", "gu", "yu", "cu", "su", "ru", "uu", "tu", "so"];
  // BEGIN AUTOMATION CONTRACT: vendored by scripts/sync-automation-contracts.mjs.
  const automationKeys = (object, allowed) => isObject(object) && Object.keys(object).every(key => allowed.includes(key));
  const automationText = (value, limit = 160) => typeof value === "string" && value.trim().length > 0 && value.length <= limit;
  function automationCardValidator() {
    const keys = automationKeys, text = automationText;
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
    return card;
  }
  // Generated schema snapshot; scripts/sync-automation-contracts.mjs maintains this block.
  const AUTOMATION_ACTION_SCHEMA = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://a8f.github.io/Dueling-Book-Enhancer/schemas/card-action-v2.schema.json","title":"Card effect lifecycle v2 (spec 1)","description":"Declarative effect lifecycle and reusable operations. This executable subset accepts two complete compositions; unsupported compositions remain rejected. Coverage records mandatory human responsibilities.","$defs":{"card":{"type":"object","additionalProperties":false,"properties":{"name":{"type":"string","maxLength":160,"pattern":"\\S"},"passcode":{"type":"string","pattern":"^[0-9]{8}$","not":{"const":"00000000"}},"id":{"type":"integer","minimum":1,"maximum":9007199254740991}},"required":["name"],"oneOf":[{"required":["passcode"],"not":{"required":["id"]}},{"required":["id"],"not":{"required":["passcode"]}}]},"summon":{"type":"object","additionalProperties":false,"properties":{"op":{"const":"special-summon"},"from":{"const":"deck"},"card":{"$ref":"#/$defs/card"},"position":{"type":"object","additionalProperties":false,"properties":{"choice":{"const":"position"}},"required":["choice"]},"reason":{"const":"effect"},"onNoMonsterZone":{"type":"object","additionalProperties":false,"properties":{"op":{"const":"destroy"},"reason":{"const":"effect"}},"required":["op","reason"]}},"required":["op","from","card","position","reason"]},"search":{"type":"object","additionalProperties":false,"properties":{"op":{"const":"search"},"from":{"const":"deck"},"to":{"const":"hand"},"filter":{"const":"monsters"},"count":{"const":1},"reveal":{"const":true},"shuffle":{"const":true},"checks":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"check":{"const":"absent-face-up"},"cards":{"type":"array","items":{"$ref":"#/$defs/card"},"minItems":0,"maxItems":10}},"required":["check","cards"]},"minItems":0,"maxItems":1}},"required":["op","from","to","filter","count","reveal","shuffle","checks"]},"destroy":{"type":"object","additionalProperties":false,"properties":{"op":{"const":"destroy"},"reason":{"const":"effect"},"selection":{"type":"object","additionalProperties":false,"properties":{"at":{"const":"resolution"},"from":{"const":"field"},"players":{"const":"both"},"cardTypes":{"type":"array","items":{"enum":["spell","trap"]},"minItems":2,"maxItems":2,"uniqueItems":true},"minimum":{"enum":[0,1]},"maximum":{"type":"object","additionalProperties":false,"properties":{"count":{"type":"object","additionalProperties":false,"properties":{"zone":{"const":"monster"},"player":{"const":"self"},"faceUp":{"const":true},"exclude":{"const":"source"},"filter":{"const":"monsters"}},"required":["zone","player","faceUp","exclude","filter"]}},"required":["count"]}},"required":["at","from","players","cardTypes","minimum","maximum"]}},"required":["op","reason","selection"]},"branch":{"type":"object","additionalProperties":false,"properties":{"op":{"const":"branch"},"choice":{"const":"mode"},"cases":{"type":"object","additionalProperties":false,"properties":{"search":{"type":"array","items":{"$ref":"#/$defs/search"},"minItems":1,"maxItems":1},"destroy":{"type":"array","items":{"$ref":"#/$defs/destroy"},"minItems":1,"maxItems":1}},"required":["search","destroy"]}},"required":["op","choice","cases"]}},"oneOf":[{"type":"object","additionalProperties":false,"properties":{"schemaVersion":{"const":2},"source":{"type":"object","additionalProperties":false,"properties":{"zone":{"const":"graveyard"},"player":{"const":"self"}},"required":["zone","player"]},"timing":{"type":"object","additionalProperties":false,"properties":{"kind":{"const":"ignition"},"turn":{"const":"self"},"phases":{"type":"array","items":{"enum":["DP","SP","M1","BP","M2","EP"]},"minItems":1,"maxItems":6,"uniqueItems":true},"verification":{"const":"manual"}},"required":["kind","turn","phases","verification"]},"filters":{"type":"object","additionalProperties":false,"properties":{},"required":[]},"activation":{"type":"object","additionalProperties":false,"properties":{"checks":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"check":{"const":"absent-face-up"},"cards":{"type":"array","items":{"$ref":"#/$defs/card"},"minItems":0,"maxItems":10}},"required":["check","cards"]},"minItems":0,"maxItems":1},"choices":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"id":{"const":"position"},"kind":{"const":"position"},"options":{"type":"array","items":{"enum":["ATK","DEF"]},"minItems":1,"maxItems":2,"uniqueItems":true}},"required":["id","kind","options"]},"minItems":1,"maxItems":1},"costs":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"op":{"const":"banish"},"card":{"const":"source"},"reason":{"const":"cost"}},"required":["op","card","reason"]},"minItems":1,"maxItems":1},"targets":{"type":"array","items":{},"minItems":0,"maxItems":0}},"required":["checks","choices","costs","targets"]},"resolution":{"type":"array","items":{"$ref":"#/$defs/summon"},"minItems":1,"maxItems":1},"coverage":{"type":"object","additionalProperties":false,"properties":{"level":{"const":"assisted"},"manual":{"type":"array","items":{"enum":["activation-legality","responses-and-chains","negation","replacement-and-protection","movement-consequences","special-summon-legality","trigger-window","dynamic-card-properties","opponent-movement"]},"minItems":6,"maxItems":9,"uniqueItems":true,"allOf":[{"contains":{"const":"activation-legality"}},{"contains":{"const":"responses-and-chains"}},{"contains":{"const":"negation"}},{"contains":{"const":"replacement-and-protection"}},{"contains":{"const":"movement-consequences"}},{"contains":{"const":"special-summon-legality"}}]}},"required":["level","manual"]}},"required":["schemaVersion","source","timing","filters","activation","resolution","coverage"]},{"type":"object","additionalProperties":false,"properties":{"schemaVersion":{"const":2},"source":{"type":"object","additionalProperties":false,"properties":{"zone":{"const":"monster"},"player":{"const":"self"}},"required":["zone","player"]},"timing":{"type":"object","additionalProperties":false,"properties":{"kind":{"const":"optional-trigger"},"turn":{"const":"either"},"phases":{"type":"array","items":{"enum":["DP","SP","M1","BP","M2","EP"]},"minItems":6,"maxItems":6,"uniqueItems":true},"verification":{"const":"manual"},"events":{"type":"array","items":{"enum":["normal-summon","special-summon"]},"minItems":2,"maxItems":2,"uniqueItems":true},"damageStep":{"const":true}},"required":["kind","turn","phases","verification","events","damageStep"]},"filters":{"type":"object","additionalProperties":false,"properties":{"monsters":{"type":"object","additionalProperties":false,"properties":{"cardType":{"const":"monster"},"cards":{"type":"array","items":{"$ref":"#/$defs/card"},"minItems":1,"maxItems":500},"namePrefixes":{"type":"array","items":{"type":"string","maxLength":80,"allOf":[{"pattern":"\\S"},{"pattern":" $"}]},"minItems":1,"maxItems":10}},"required":["cardType"],"oneOf":[{"required":["cards"],"not":{"required":["namePrefixes"]}},{"required":["namePrefixes"],"not":{"required":["cards"]}}]}},"required":["monsters"]},"activation":{"type":"object","additionalProperties":false,"properties":{"checks":{"type":"array","items":{},"minItems":0,"maxItems":0},"choices":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"id":{"const":"mode"},"kind":{"const":"option"},"options":{"type":"array","items":{"enum":["search","destroy"]},"minItems":2,"maxItems":2,"uniqueItems":true}},"required":["id","kind","options"]},"minItems":1,"maxItems":1},"costs":{"type":"array","items":{},"minItems":0,"maxItems":0},"targets":{"type":"array","items":{},"minItems":0,"maxItems":0}},"required":["checks","choices","costs","targets"]},"resolution":{"type":"array","items":{"$ref":"#/$defs/branch"},"minItems":1,"maxItems":1},"coverage":{"type":"object","additionalProperties":false,"properties":{"level":{"const":"assisted"},"manual":{"type":"array","items":{"enum":["activation-legality","responses-and-chains","negation","replacement-and-protection","movement-consequences","special-summon-legality","trigger-window","dynamic-card-properties","opponent-movement"]},"minItems":8,"maxItems":9,"uniqueItems":true,"allOf":[{"contains":{"const":"activation-legality"}},{"contains":{"const":"responses-and-chains"}},{"contains":{"const":"negation"}},{"contains":{"const":"replacement-and-protection"}},{"contains":{"const":"movement-consequences"}},{"contains":{"const":"trigger-window"}},{"contains":{"const":"dynamic-card-properties"}},{"contains":{"const":"opponent-movement"}}]}},"required":["level","manual"]}},"required":["schemaVersion","source","timing","filters","activation","resolution","coverage"]}]};
  function automationSchemaValid(value, schema, root = AUTOMATION_ACTION_SCHEMA) {
    if (schema.$ref) return automationSchemaValid(value, root.$defs[schema.$ref.split("/").pop()], root);
    if (Object.hasOwn(schema, "const") && JSON.stringify(value) !== JSON.stringify(schema.const)) return false;
    if (schema.enum && !schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value))) return false;
    if (schema.allOf && !schema.allOf.every(item => automationSchemaValid(value, item, root))) return false;
    if (schema.oneOf && schema.oneOf.filter(item => automationSchemaValid(value, item, root)).length !== 1) return false;
    if (schema.not && automationSchemaValid(value, schema.not, root)) return false;
    if (schema.required && (!isObject(value) || !schema.required.every(key => Object.hasOwn(value, key)))) return false;
    if (schema.type === "object") {
      if (!isObject(value)) return false;
      if (schema.additionalProperties === false && Object.keys(value).some(key => !Object.hasOwn(schema.properties, key))) return false;
      if (Object.entries(schema.properties).some(([key, child]) => Object.hasOwn(value, key) && !automationSchemaValid(value[key], child, root))) return false;
    }
    if (schema.type === "array") {
      if (!Array.isArray(value) || value.length < (schema.minItems || 0) || value.length > (schema.maxItems ?? Infinity)) return false;
      if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) return false;
      if (!value.every(item => automationSchemaValid(item, schema.items, root))) return false;
    }
    if (schema.contains && (!Array.isArray(value) || !value.some(item => automationSchemaValid(item, schema.contains, root)))) return false;
    if (schema.type === "string" && (typeof value !== "string" || value.length > (schema.maxLength ?? Infinity))) return false;
    if (schema.pattern && (typeof value !== "string" || !new RegExp(schema.pattern).test(value))) return false;
    if (schema.type === "integer" && (!Number.isSafeInteger(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) return false;
    return true;
  }
  function automationActionValid(value, card) {
    if (!automationSchemaValid(value, AUTOMATION_ACTION_SCHEMA)) return false;
    function identities(value) {
      if (!value || typeof value !== "object") return true;
      if (Object.hasOwn(value, "name") && (Object.hasOwn(value, "passcode") || Object.hasOwn(value, "id"))) return card(value);
      return Object.values(value).every(identities);
    }
    return identities(value);
  }
  const AUTOMATION_MANUAL = Object.freeze({
    "activation-legality": "Confirm activation legality and restrictions.",
    "responses-and-chains": "Handle responses and chain resolution manually.",
    negation: "Adjudicate negation and continuous effects.",
    "replacement-and-protection": "Adjudicate protection and replacement effects.",
    "movement-consequences": "Apply destruction and simultaneous movement consequences manually.",
    "special-summon-legality": "Confirm the selected monster can legally be Special Summoned.",
    "trigger-window": "Confirm the summon trigger window, missed timing and Damage Step.",
    "dynamic-card-properties": "Adjudicate changed names, types, archetypes and ability to add cards.",
    "opponent-movement": "The opponent moves their selected cards."
  });
  const automationCommonManual = ["activation-legality", "responses-and-chains", "negation", "replacement-and-protection", "movement-consequences"];
  function banishSummonAction({ phases = ["M1", "M2"], card, positions = ["ATK", "DEF"], absentFaceUpCards = [], onNoMonsterZone } = {}) {
    return { schemaVersion: 2, source: { zone: "graveyard", player: "self" },
      timing: { kind: "ignition", turn: "self", phases: [...phases], verification: "manual" }, filters: {},
      activation: { checks: absentFaceUpCards.length ? [{ check: "absent-face-up", cards: copy(absentFaceUpCards) }] : [],
        choices: [{ id: "position", kind: "position", options: [...positions] }], costs: [{ op: "banish", card: "source", reason: "cost" }], targets: [] },
      resolution: [{ op: "special-summon", from: "deck", card: copy(card), position: { choice: "position" }, reason: "effect",
        ...(onNoMonsterZone ? { onNoMonsterZone: { op: "destroy", reason: "effect" } } : {}) }],
      coverage: { level: "assisted", manual: [...automationCommonManual, "special-summon-legality"] } };
  }
  function summonChoiceAction({ monsterCards, monsterNamePrefixes, destructionMinimum = 0, searchAbsentFaceUpCards = [] } = {}) {
    return { schemaVersion: 2, source: { zone: "monster", player: "self" },
      timing: { kind: "optional-trigger", turn: "either", phases: ["DP", "SP", "M1", "BP", "M2", "EP"], verification: "manual",
        events: ["normal-summon", "special-summon"], damageStep: true },
      filters: { monsters: { cardType: "monster", ...(monsterCards !== undefined ? { cards: copy(monsterCards) } : {}),
        ...(monsterNamePrefixes !== undefined ? { namePrefixes: [...monsterNamePrefixes] } : {}) } },
      activation: { checks: [], choices: [{ id: "mode", kind: "option", options: ["search", "destroy"] }], costs: [], targets: [] },
      resolution: [{ op: "branch", choice: "mode", cases: {
        search: [{ op: "search", from: "deck", to: "hand", filter: "monsters", count: 1, reveal: true, shuffle: true,
          checks: searchAbsentFaceUpCards.length ? [{ check: "absent-face-up", cards: copy(searchAbsentFaceUpCards) }] : [] }],
        destroy: [{ op: "destroy", reason: "effect", selection: { at: "resolution", from: "field", players: "both", cardTypes: ["spell", "trap"],
          minimum: destructionMinimum, maximum: { count: { zone: "monster", player: "self", faceUp: true, exclude: "source", filter: "monsters" } } } }]
      } }], coverage: { level: "assisted", manual: [...automationCommonManual, "trigger-window", "dynamic-card-properties", "opponent-movement"] } };
  }
  function validateAutomationAction(value) {
    if (!automationActionValid(value, automationCardValidator())) throw new Error("Invalid action definition. Use action schema 2 and a supported complete pipeline.");
    return copy(value);
  }
  function validateAutomationList(value) {
    const keys = automationKeys, text = automationText, card = automationCardValidator();
    const rule = value => keys(value, ["id", "card", "label", "action"]) &&
      text(value.id, 80) && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value.id) && card(value.card) && text(value.label) &&
      automationActionValid(value.action, card);

    if (!keys(value, ["schemaVersion", "id", "name", "version", "formats", "enabled", "rules"]) || value.schemaVersion !== 4 ||
        typeof value.id !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value.id) ||
        typeof value.name !== "string" || !value.name.trim() || value.name.length > 80 ||
        typeof value.version !== "string" || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value.version) ||
        !Array.isArray(value.formats) || !value.formats.length || value.formats.length > AUTOMATION_FORMATS.length ||
        new Set(value.formats).size !== value.formats.length ||
        value.formats.some(format => !AUTOMATION_FORMATS.includes(format)) ||
        !Array.isArray(value.rules) || !value.rules.length || value.rules.length > 100 ||
        value.rules.some(candidate => !rule(candidate)) ||
        new Set(value.rules.map(rule => rule.id)).size !== value.rules.length) {
      throw new Error("Invalid rules list. Use schema 4 with action schema 2, an eight-digit passcode (or positive Duelingbook card ID) and name, valid formats, prerequisites, and supported action steps.");
    }
    // Reject extensions to the schema rather than silently discarding instructions.
    if (value.enabled !== undefined && typeof value.enabled !== "boolean") throw new Error("Invalid list enablement.");
    return { schemaVersion: 4, id: value.id, name: value.name.trim(), version: value.version,
      formats: [...new Set(value.formats)], enabled: value.enabled === true,
      rules: copy(value.rules) };
  }
  function importAutomationList(text) {
    if (typeof text !== "string" || automationUtf8Size(text) > 65536) throw new Error("Rules list exceeds 64 KB.");
    const list = validateAutomationList(JSON.parse(text));
    list.enabled = false;
    return list;
  }
  function exportAutomationList(list) {
    const { enabled, ...definition } = validateAutomationList(list);
    const text = JSON.stringify(definition, null, 2);
    if (automationUtf8Size(text) > 65536) throw new Error("Rules list exceeds 64 KB.");
    return text;
  }
  function automationUtf8Size(text) {
    let bytes = 0;
    for (const char of text) {
      const code = char.codePointAt(0);
      bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    }
    return bytes;
  }

export default { AUTOMATION_MANUAL, banishSummonAction, summonChoiceAction, validateAutomationAction, validateAutomationList, importAutomationList, exportAutomationList };
