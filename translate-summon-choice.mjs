import core from "./schema-3.mjs";

// Recognize the complete effect family, not a bag of interesting Lua calls.
// Identities and archetype membership are supplied by the selected database.
function template(id, setcode, minimum) {
  return `function c${id}.initial_effect(c)
    local e1=Effect.CreateEffect(c)
    e1:SetDescription(aux.Stringid(${id},0))
    e1:SetProperty(EFFECT_FLAG_DAMAGE_STEP)
    e1:SetType(EFFECT_TYPE_TRIGGER_O+EFFECT_TYPE_SINGLE)
    e1:SetCode(EVENT_SUMMON_SUCCESS)
    e1:SetTarget(c${id}.target)
    e1:SetOperation(c${id}.operation)
    c:RegisterEffect(e1)
    local e2=e1:Clone()
    e2:SetCode(EVENT_SPSUMMON_SUCCESS)
    c:RegisterEffect(e2)
  end
  function c${id}.countfilter(c)
    return c:IsFaceup() and c:IsSetCard(${setcode})
  end
  function c${id}.searchfilter(c)
    return c:IsSetCard(${setcode}) and c:IsType(TYPE_MONSTER) and c:IsAbleToHand()
  end
  function c${id}.destroyfilter(c)
    return c:IsType(TYPE_SPELL+TYPE_TRAP)
  end
  function c${id}.target(e,tp,eg,ep,ev,re,r,rp,chk)
    local c=e:GetHandler()
    if chk==0 then
      local ct=Duel.GetMatchingGroupCount(c${id}.countfilter,tp,LOCATION_MZONE,0,c)
      local sel=0
      if ct>0 and Duel.IsExistingMatchingCard(c${id}.destroyfilter,tp,LOCATION_ONFIELD,LOCATION_ONFIELD,1,nil) then sel=sel+1 end
      if Duel.IsExistingMatchingCard(c${id}.searchfilter,tp,LOCATION_DECK,0,1,nil) then sel=sel+2 end
      e:SetLabel(sel)
      return sel~=0
    end
    local sel=e:GetLabel()
    if sel==3 then
      Duel.Hint(HINT_SELECTMSG,tp,aux.Stringid(${id},0))
      sel=Duel.SelectOption(tp,aux.Stringid(${id},1),aux.Stringid(${id},2))+1
    elseif sel==1 then
      Duel.SelectOption(tp,aux.Stringid(${id},1))
    else
      Duel.SelectOption(tp,aux.Stringid(${id},2))
    end
    e:SetLabel(sel)
    if sel==1 then
      local g=Duel.GetMatchingGroup(c${id}.destroyfilter,tp,LOCATION_ONFIELD,LOCATION_ONFIELD,nil)
      e:SetCategory(CATEGORY_DESTROY)
      Duel.SetOperationInfo(0,CATEGORY_DESTROY,g,1,0,0)
    else
      e:SetCategory(CATEGORY_TOHAND+CATEGORY_SEARCH)
      Duel.SetOperationInfo(0,CATEGORY_TOHAND,nil,1,tp,LOCATION_DECK)
    end
  end
  function c${id}.operation(e,tp,eg,ep,ev,re,r,rp)
    local c=e:GetHandler()
    local sel=e:GetLabel()
    if sel==1 then
      local ct=Duel.GetMatchingGroupCount(c${id}.countfilter,tp,LOCATION_MZONE,0,c)
      local g=Duel.GetMatchingGroup(c${id}.destroyfilter,tp,LOCATION_ONFIELD,LOCATION_ONFIELD,nil)
      if ct>0 and g:GetCount()>0 then
        Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_DESTROY)
        local dg=g:Select(tp,${minimum},ct,nil)
        Duel.HintSelection(dg)
        Duel.Destroy(dg,REASON_EFFECT)
      end
    else
      Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_ATOHAND)
      local g=Duel.SelectMatchingCard(tp,c${id}.searchfilter,tp,LOCATION_DECK,0,1,1,nil)
      if g:GetCount()>0 then
        Duel.SendtoHand(g,nil,REASON_EFFECT)
        Duel.ConfirmCards(1-tp,g)
      end
    end
  end`;
}

// Helper/local names and decimal/hex spellings are irrelevant to behavior.
// Operators, constants, calls, arguments, branches and all extra tokens remain.
function canonical(input, namespace) {
  const functions = new Map();
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "function" && input[i + 1] === namespace && input[i + 2] === ".") {
      const name = input[i + 3];
      if (functions.has(name)) return null;
      functions.set(name, name === "initial_effect" ? "initial_effect" : "@helper" + functions.size);
    }
  }
  let variables = new Map(), locals = 0;
  return input.map((token, i) => {
    if (token === "function") {
      variables = new Map(); locals = 0;
      let index = i + 4;
      if (input[index] === "(") {
        let parameter = 0;
        for (index++; index < input.length && input[index] !== ")"; index++) {
          if (/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(input[index])) variables.set(input[index], "@parameter" + parameter++);
        }
      }
    }
    if (token === "local") {
      let index = i + 1;
      while (/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(input[index] || "") && input[index] !== "function") {
        if (!variables.has(input[index])) variables.set(input[index], "@local" + locals++);
        if (input[index + 1] !== ",") break;
        index += 2;
      }
    }
    if (input[i - 1] === "." && input[i - 2] === namespace) return functions.get(token) || token;
    if (input[i - 1] !== "." && input[i - 1] !== ":" && variables.has(token)) return variables.get(token);
    return /^(?:0[xX][a-fA-F0-9]+|\d+)$/.test(token) ? String(BigInt(token)) : token;
  });
}

export function translateSummonChoice(input, source, { tokenize, resolveSetCards } = {}) {
  const sets = input.flatMap((token, i) => token === "IsSetCard" && input[i + 1] === "(" &&
    /^(?:0[xX][a-fA-F0-9]+|\d+)$/.test(input[i + 2] || "") ? [Number(input[i + 2])] : []);
  if (sets.length !== 2 || sets[0] !== sets[1] || sets[0] <= 0 || sets[0] > 0xffff) return null;
  const namespace = "c" + Number(source.passcode);
  const normalized = canonical(input, namespace);
  if (!normalized) return null;
  const minimum = [0, 1].find(value => JSON.stringify(normalized) === JSON.stringify(canonical(tokenize(template(Number(source.passcode), sets[0], value)), namespace)));
  if (minimum === undefined) return null;
  if (typeof resolveSetCards !== "function") throw new Error("Recognized summon choice needs simulator archetype membership from cards.cdb; no name filter is inferred from prose.");
  const cards = resolveSetCards(sets[0]);
  const rule = {
    id: "ygopro-" + source.passcode, card: { passcode: source.passcode, name: source.name },
    label: "On summon: search a monster or destroy Spells/Traps",
    requires: { sourceZone: "monster", ownTurn: false, phases: ["DP", "SP", "M1", "BP", "M2", "EP"], trigger: "normal-or-special-summon" },
    activation: [], resolution: [{ op: "choose-search-or-destroy", monsterCards: cards, destructionMinimum: minimum, searchAbsentFaceUpCards: [] }]
  };
  core.validateAutomationList({ schemaVersion: 3, id: "extracted", name: "Extracted", version: "1.0.0", formats: ["so"], rules: [rule] });
  return rule;
}

// cards.cdb packs up to four archetypes in 16-bit lanes. Match the base family
// and requested subtype bits, as check_setcode does in the simulator core.
// https://github.com/Fluorohydride/ygopro-core/blob/master/card_data.h
export function matchesSetcode(packed, requested) {
  if (!Number.isInteger(requested) || requested <= 0 || requested > 0xffff) throw new Error("Invalid archetype code");
  // Newer databases use a BLOB of little-endian 16-bit archetypes, rather
  // than the legacy packed integer. Node SQLite returns it as Uint8Array.
  if (packed instanceof Uint8Array) {
    if (packed.length % 2) throw new Error("Invalid simulator archetype blob");
    for (let i = 0; i < packed.length; i += 2) {
      if (matchesSetcode(packed[i] | (packed[i + 1] << 8), requested)) return true;
    }
    return false;
  }
  if (typeof packed === "number" && !Number.isSafeInteger(packed)) throw new Error("Unsafe packed archetype integer");
  let value = BigInt.asUintN(64, BigInt(packed || 0));
  const set = BigInt(requested);
  for (let lane = 0; lane < 4; lane++, value >>= 16n) {
    const code = value & 0xffffn;
    if ((code & 0xfffn) === (set & 0xfffn) && (code & set & 0xf000n) === (set & 0xf000n)) return true;
  }
  return false;
}
