-- Fictional recruiter fixture; not a shipped card rule.
function c9000001.initial_effect(c)
 local e1=Effect.CreateEffect(c)
 e1:SetDescription(aux.Stringid(9000001,0))
 e1:SetCategory(CATEGORY_SPECIAL_SUMMON)
 e1:SetType(EFFECT_TYPE_IGNITION)
 e1:SetRange(LOCATION_GRAVE)
 e1:SetCost(aux.bfgcost)
 e1:SetTarget(c9000001.target)
 e1:SetOperation(c9000001.operation)
 c:RegisterEffect(e1)
end
function c9000001.filter(c,e,sp)
 return c:IsCode(9000002) and c:IsCanBeSpecialSummoned(e,0,sp,false,false)
end
function c9000001.target(e,tp,eg,ep,ev,re,r,rp,chk)
 if chk==0 then return Duel.IsExistingMatchingCard(c9000001.filter,tp,LOCATION_DECK,0,1,nil,e,tp)
 and Duel.GetLocationCount(tp,LOCATION_MZONE)>0 end
 Duel.SetOperationInfo(0,CATEGORY_SPECIAL_SUMMON,nil,1,tp,LOCATION_DECK)
end
function c9000001.operation(e,tp,eg,ep,ev,re,r,rp)
 if Duel.GetLocationCount(tp,LOCATION_MZONE)<=0 then return end
 local sc=Duel.GetFirstMatchingCard(c9000001.filter,tp,LOCATION_DECK,0,nil,e,tp)
 if sc then Duel.SpecialSummon(sc,0,tp,tp,false,false,POS_FACEUP) end
end
