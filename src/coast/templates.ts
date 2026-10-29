/**
 * Storm-surge advisories for the coastal barangay. Placeholders: {level} sea level in m,
 * {surge} m above the normal tide, {peak} forecast peak in m, {eta} hours to the peak.
 * Same wording style as the creek alerts, but the instruction is "go to higher ground".
 */
import type { Lang, Status } from '../state';

const COAST: Record<Lang, Record<Status, string>> = {
  en: {
    NORMAL: 'Sea level {level} m. The tide is normal. No storm surge expected.',
    ADVISORY:
      'STORM SURGE ADVISORY: A typhoon is approaching. The sea could reach {peak} m in about {eta} hours. Prepare go-bags and plan your route to higher ground.',
    WARNING:
      'STORM SURGE WARNING: The sea is {surge} m above the normal tide and could top the seawall at {peak} m in about {eta} hours. Families on the shore, move to higher ground now while it is safe.',
    EVACUATE:
      'EVACUATE NOW: Storm surge is coming over the seawall. Leave the shore and walk to the school on the hill. Do not wait for the water. Bring your go-bag.',
  },
  tl: {
    NORMAL: 'Ang lebel ng dagat ay {level} m. Normal ang taog. Walang inaasahang daluyong.',
    ADVISORY:
      'ABISO SA DALUYONG: May paparating na bagyo. Maaaring umabot ang dagat sa {peak} m sa loob ng mga {eta} oras. Ihanda ang go-bag at alamin ang daan papunta sa mataas na lugar.',
    WARNING:
      'BABALA SA DALUYONG: {surge} m na ang taas ng dagat kaysa sa normal na taog at maaaring lumampas sa seawall ({peak} m) sa loob ng mga {eta} oras. Ang mga nakatira sa tabing-dagat, lumipat na sa mataas na lugar habang ligtas pa.',
    EVACUATE:
      'LUMIKAS NA: Umaapaw na ang daluyong sa seawall. Umalis na sa tabing-dagat at pumunta sa paaralan sa burol. Huwag nang hintayin ang tubig. Dalhin ang go-bag.',
  },
  ceb: {
    NORMAL: 'Ang lebel sa dagat {level} m. Normal ang taob. Walay gilauman nga storm surge.',
    ADVISORY:
      'PAHIBALO SA STORM SURGE: Adunay bagyo nga nagpaduol. Ang dagat mahimong moabot sa {peak} m sulod sa mga {eta} ka oras. Andama ang go-bag ug planoha ang dalan paingon sa taas nga lugar.',
    WARNING:
      'PASIDAAN SA STORM SURGE: {surge} m na ang dagat labaw sa normal nga taob ug mahimong molapas sa seawall ({peak} m) sulod sa mga {eta} ka oras. Ang mga nagpuyo sa baybayon, balhin na sa taas nga lugar samtang luwas pa.',
    EVACUATE:
      'BAKWIT NA: Ang storm surge nag-awas na sa seawall. Biya na sa baybayon ug adto sa eskwelahan sa bungtod. Ayaw na hulata ang tubig. Dad-a ang go-bag.',
  },
  war: {
    NORMAL: 'An lebel han dagat {level} m. Normal an taob. Waray ginlalauman nga storm surge.',
    ADVISORY:
      'PAHIBARO HA STORM SURGE: May bagyo nga nagtitirok. An dagat puydi umabot ha {peak} m ha sulod han mga {eta} ka oras. Igpreparar an go-bag ngan planoha an dalan pakadto ha hitaas nga lugar.',
    WARNING:
      'PASIDAAN HA STORM SURGE: {surge} m na an dagat labaw ha normal nga taob ngan puydi lumapas ha seawall ({peak} m) ha sulod han mga {eta} ka oras. An mga naukoy ha baybayon, balhin na ha hitaas nga lugar samtang luwas pa.',
    EVACUATE:
      'BAKWIT NA: An storm surge nag-aawas na ha seawall. Bayai an baybayon ngan kadto ha eskwelahan ha bukid. Ayaw na hulata an tubig. Darha an go-bag.',
  },
};

// after the peak: still high water, stay put
const RECEDING: Record<Lang, string> = {
  en: 'The storm surge is going down but the sea is still {surge} m above normal. Stay on high ground until the barangay says it is safe to go home.',
  tl: 'Bumababa na ang daluyong pero {surge} m pa rin ang taas ng dagat kaysa sa normal. Manatili sa mataas na lugar hanggang sabihin ng barangay na ligtas nang umuwi.',
  ceb: 'Nagkunhod na ang storm surge apan {surge} m pa ang dagat labaw sa normal. Pabilin sa taas nga lugar hangtod moingon ang barangay nga luwas na mopauli.',
  war: 'Nahuhubas na an storm surge kondi {surge} m pa an dagat labaw ha normal. Pabilin ha hitaas nga lugar tubtob nga sumiring an barangay nga luwas na umuli.',
};

export function coastAdvisory(lang: Lang, status: Status, v: { level: number; surge: number; peak: number; eta: number }): string {
  const m = (x: number) => x.toFixed(1);
  const text = status === 'ADVISORY' && v.eta <= 0.5 ? RECEDING[lang] : COAST[lang][status];
  return text
    .replace('{level}', m(v.level))
    .replace('{surge}', m(Math.max(0, v.surge)))
    .replace('{peak}', m(v.peak))
    .replace('{eta}', String(Math.max(1, Math.round(v.eta))));
}
