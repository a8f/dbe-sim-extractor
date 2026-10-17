-- Synthetic summon-choice scout. Names deliberately differ from the compiler.
function c9000005.initial_effect(subject)
  local normal=Effect.CreateEffect(subject)
  normal:SetDescription(aux.Stringid(9000005,0))
  normal:SetProperty(EFFECT_FLAG_DAMAGE_STEP)
  normal:SetType(EFFECT_TYPE_TRIGGER_O+EFFECT_TYPE_SINGLE)
  normal:SetCode(EVENT_SUMMON_SUCCESS)
  normal:SetTarget(c9000005.activation)
  normal:SetOperation(c9000005.resolve)
  subject:RegisterEffect(normal)
  local special=normal:Clone()
  special:SetCode(EVENT_SPSUMMON_SUCCESS)
  subject:RegisterEffect(special)
end
function c9000005.countFamily(subject)
  return subject:IsFaceup() and subject:IsSetCard(0x321)
end
function c9000005.searchFamily(subject)
  return subject:IsSetCard(0x321) and subject:IsType(TYPE_MONSTER) and subject:IsAbleToHand()
end
function c9000005.spellTrap(subject)
  return subject:IsType(TYPE_SPELL+TYPE_TRAP)
end
function c9000005.activation(effect,player,triggering,who,value,reasonEffect,reason,reasonPlayer,check)
  local handler=effect:GetHandler()
  if check==0 then
    local amount=Duel.GetMatchingGroupCount(c9000005.countFamily,player,LOCATION_MZONE,0,handler)
    local mode=0
    if amount>0 and Duel.IsExistingMatchingCard(c9000005.spellTrap,player,LOCATION_ONFIELD,LOCATION_ONFIELD,1,nil) then mode=mode+1 end
    if Duel.IsExistingMatchingCard(c9000005.searchFamily,player,LOCATION_DECK,0,1,nil) then mode=mode+2 end
    effect:SetLabel(mode)
    return mode~=0
  end
  local mode=effect:GetLabel()
  if mode==3 then
    Duel.Hint(HINT_SELECTMSG,player,aux.Stringid(9000005,0))
    mode=Duel.SelectOption(player,aux.Stringid(9000005,1),aux.Stringid(9000005,2))+1
  elseif mode==1 then
    Duel.SelectOption(player,aux.Stringid(9000005,1))
  else
    Duel.SelectOption(player,aux.Stringid(9000005,2))
  end
  effect:SetLabel(mode)
  if mode==1 then
    local cards=Duel.GetMatchingGroup(c9000005.spellTrap,player,LOCATION_ONFIELD,LOCATION_ONFIELD,nil)
    effect:SetCategory(CATEGORY_DESTROY)
    Duel.SetOperationInfo(0,CATEGORY_DESTROY,cards,1,0,0)
  else
    effect:SetCategory(CATEGORY_TOHAND+CATEGORY_SEARCH)
    Duel.SetOperationInfo(0,CATEGORY_TOHAND,nil,1,player,LOCATION_DECK)
  end
end
function c9000005.resolve(effect,player,triggering,who,value,reasonEffect,reason,reasonPlayer)
  local handler=effect:GetHandler()
  local mode=effect:GetLabel()
  if mode==1 then
    local amount=Duel.GetMatchingGroupCount(c9000005.countFamily,player,LOCATION_MZONE,0,handler)
    local cards=Duel.GetMatchingGroup(c9000005.spellTrap,player,LOCATION_ONFIELD,LOCATION_ONFIELD,nil)
    if amount>0 and cards:GetCount()>0 then
      Duel.Hint(HINT_SELECTMSG,player,HINTMSG_DESTROY)
      local chosen=cards:Select(player,1,amount,nil)
      Duel.HintSelection(chosen)
      Duel.Destroy(chosen,REASON_EFFECT)
    end
  else
    Duel.Hint(HINT_SELECTMSG,player,HINTMSG_ATOHAND)
    local cards=Duel.SelectMatchingCard(player,c9000005.searchFamily,player,LOCATION_DECK,0,1,1,nil)
    if cards:GetCount()>0 then
      Duel.SendtoHand(cards,nil,REASON_EFFECT)
      Duel.ConfirmCards(1-player,cards)
    end
  end
end
