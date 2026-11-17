import type {SpecialistId} from './specialist-profiles.ts';

export interface ClinicalDestination{
 specialty:SpecialistId;
 label:string;
 urgentHint?:string;
}
/** Heuristic intent-to-specialty routing, NOT diagnosis. The clinician may
 * choose another specialist manually before sending the question. */
const rules:Array<{id:SpecialistId;label:string;test:RegExp}>= [
 {id:'cardiology',label:'Кардиология',test:/болит\s+сердц|сердечн.*бол|боль\s+(?:в|за)\s+(?:груд|грудин|сердц)|давит\s+(?:в\s+)?груд|тахикард|сердцебиен|аритми|гипертони|инфаркт|экг.*(?:вопрос|расшифр)|chest\s+(?:pain|pressure)|palpitation|arrhythm/i},
 {id:'pulmonology',label:'Пульмонология',test:/кашел|кашель|кашл|одышк|свист(?:ящ|\s+при|\s+в)|хрип|бронх|астм|пневмон|легочн|лёгочн|дыхани|wheez|cough|dyspn|breathlessness|asthma|pneumonia/i},
 {id:'neurology',label:'Неврология',test:/инсульт|парез|парестез|судорог|головн.*бол|головокруж|мигрен|невропат|stroke|seizure|headache|migraine/i},
 {id:'endocrinology',label:'Эндокринология',test:/диабет|тирео|щитовид|гипогликем|гипергликем|эндокрин|glucose|diabetes|thyroid/i},
 {id:'gastroenterology',label:'Гастроэнтерология',test:/живот|желуд|печен|печён|кишеч|диаре|тошнот|рвот|изжог|панкреат|hepatitis|abdominal|diarrh|vomit/i},
 {id:'rheumatology',label:'Ревматология',test:/ревмат|артрит|васкулит|волчанк|аутоиммун|сустав.*бол|joint\s+pain|lupus|vasculitis/i},
 {id:'hematology',label:'Гематология',test:/анеми|нейтропени|тромбоцитопени|лейкоцит|гемоглобин|коагулопати|hematolog|anemia|haemoglobin/i},
 {id:'gynecology',label:'Акушерство и гинекология',test:/беремен|гинеколог|менструац|маточн|тазов.*бол|pregnan|gynaecolog|gynecolog/i},
 {id:'pediatrics',label:'Педиатрия',test:/у\s+ребенк|у\s+ребёнк|ребенок|ребёнок|младен|новорожден|child|infant|pediatric/i},
 {id:'dermatology',label:'Дерматология',test:/сыпь|кожн|дермат|пятн.*на\s+кож|rash|dermat|eczema/i},
 {id:'traumatology',label:'Травматология и ортопедия',test:/травм|перелом|вывих|ортопед|растяжен|fracture|injury|orthop/i},
 {id:'oncology',label:'Онкология',test:/онкол|опухол|новообразован|метастаз|рак\s+(?:лёгк|легк|желуд|молоч)|tumou?r|cancer|metasta/i},
 {id:'radiology',label:'Лучевая диагностика',test:/лучев.*диагност|радиолог|radiolog/i},
];
const CLINICAL_GENERAL=/\b(?:patient|symptom|diagnos|treat|clinical|consult|pain|fever)\b|пациент|боль|болит|болят|температур|лихорадк|слабост|недомоган|забол|симптом|жалоб|лечить|лечение|диагноз|дифдиагноз|посоветоваться\s+(?:с|по)\s+врач/i;
const NOT_CLINICAL=/^(?:что умеет|что может|какие возможности|найди инструмент\??$|покажи возможности|как открыть|открой|перейди|список модул|what can|show features)/i;
const CHEST_PAIN=/болит\s+сердц|бол[ьи]\s+в\s+груд|боль\s+(?:в|за)\s+грудин|давит\s+в\s+груд|chest\s+(?:pain|pressure)/i;
export function suggestClinicalDestination(input:string):ClinicalDestination|null{
 const text=input.trim().slice(0,1500);
 if(!text||NOT_CLINICAL.test(text))return null;
 // In a child's presentation prefer the available pediatric profile over an adult organ profile.
 // The clinician can still choose a narrower specialty manually.
 const pediatric=rules.find(rule=>rule.id==='pediatrics'&&rule.test.test(text));
 const hit=pediatric??rules.find(rule=>rule.test.test(text));
 if(!hit&&!CLINICAL_GENERAL.test(text))return null;
 const choice=hit??{id:'universal' as SpecialistId,label:'Терапия'};
 return {
  specialty:choice.id,
  label:choice.label,
  ...(CHEST_PAIN.test(text)
   ?{urgentHint:'При новой выраженной или длительной боли в груди, особенно с одышкой, обмороком, холодным потом или нестабильностью, необходима срочная очная помощь.'}
   :{}),
 };
}
