/**
 * Advisory templates per status in English, Tagalog, Cebuano and Waray, plus the
 * "Lola mode" variants (a scolding-but-loving grandmother). Placeholders:
 * {level} cm, {rate} cm/10 min (signed), {trend} word.
 */
import type { Lang, Status } from '../state';

export const LANG_NAMES: Record<Lang, string> = { en: 'English', tl: 'Tagalog', ceb: 'Cebuano', war: 'Waray' };

const TREND: Record<Lang, { up: string; down: string; steady: string }> = {
  en: { up: 'rising', down: 'falling', steady: 'steady' },
  tl: { up: 'tumataas', down: 'bumababa', steady: 'matatag' },
  ceb: { up: 'nagsaka', down: 'nagkunhod', steady: 'lig-on' },
  war: { up: 'nagtataas', down: 'nahuhubas', steady: 'diri nagbabag-o' },
};

const OFFICIAL: Record<Lang, Record<Status, string>> = {
  en: {
    NORMAL: 'Water level {level} cm and {trend}. The creek is within its normal range. Stay tuned for updates.',
    ADVISORY:
      'ADVISORY: The creek has risen to {level} cm ({rate} cm per 10 min). Prepare go-bags, secure important documents, and monitor updates.',
    WARNING:
      'WARNING: Riverbanks and low roads are flooding at {level} cm. Preemptive evacuation: low-lying households, proceed to the Barangay Hall now.',
    EVACUATE:
      'EVACUATE NOW: Water is at {level} cm and {trend}. Proceed to the Barangay Hall evacuation center. Bring your go-bag and switch off the main power.',
  },
  tl: {
    NORMAL: 'Ang lebel ng tubig ay {level} cm at {trend}. Normal ang sapa. Manatiling nakaantabay sa mga anunsyo.',
    ADVISORY:
      'ABISO: Tumaas na ang tubig sa sapa sa {level} cm ({rate} cm bawat 10 minuto). Ihanda ang go-bag at mahahalagang dokumento, at subaybayan ang mga anunsyo.',
    WARNING:
      'BABALA: Umaapaw na ang tubig sa pampang at mababang kalsada ({level} cm). Preemptive evacuation: ang mga nakatira sa mabababang lugar, lumikas na sa Barangay Hall.',
    EVACUATE:
      'LUMIKAS NA: {level} cm na ang tubig at {trend}. Pumunta agad sa evacuation center sa Barangay Hall. Dalhin ang go-bag at patayin ang main switch ng kuryente.',
  },
  ceb: {
    NORMAL: 'Ang lebel sa tubig {level} cm ug {trend}. Normal ang sapa. Padayon sa pagpaminaw sa mga pahibalo.',
    ADVISORY:
      'PAHIBALO: Mitaas na ang tubig sa sapa ngadto sa {level} cm ({rate} cm matag 10 minutos). Andama ang go-bag ug importanteng dokumento, ug bantayi ang mga pahibalo.',
    WARNING:
      'PASIDAAN: Nag-awas na ang tubig sa pangpang ug ubos nga dalan ({level} cm). Preemptive evacuation: ang mga nagpuyo sa ubos nga lugar, bakwit na sa Barangay Hall.',
    EVACUATE:
      'BAKWIT NA: {level} cm na ang tubig ug {trend}. Adto dayon sa evacuation center sa Barangay Hall. Dad-a ang go-bag ug palonga ang main switch sa kuryente.',
  },
  war: {
    NORMAL: 'An lebel han tubig {level} cm ngan {trend}. Normal an sapa. Magpabilin nga alerto ha mga pahibaro.',
    ADVISORY:
      'PAHIBARO: Tinaas na an tubig ha sapa ngadto ha {level} cm ({rate} cm kada 10 minuto). Igpreparar an go-bag ngan importante nga dokumento, ngan bantayi an mga pahibaro.',
    WARNING:
      'PASIDAAN: Nag-aawas na an tubig ha pampang ngan ubos nga dalan ({level} cm). Preemptive evacuation: an mga naukoy ha ubos nga lugar, bakwit na ngadto ha Barangay Hall.',
    EVACUATE:
      'BAKWIT NA: {level} cm na an tubig ngan {trend}. Kadto dayon ha evacuation center ha Barangay Hall. Darha an go-bag ngan patya an main switch han kuryente.',
  },
};

const LOLA: Record<Lang, Record<Status, string>> = {
  en: {
    NORMAL: "Apo, the creek is calm at {level} cm. But don't you dare leave your slippers by the river again!",
    ADVISORY: 'Hoy, apo! Water is up to {level} cm, rising {rate} cm every 10 minutes. Pack your go-bag NOW, not after your game!',
    WARNING: "Apo! It's {level} cm and the riverbank is flooding! Bring the chickens upstairs and charge your phone. Move it!",
    EVACUATE: "Aba, apo! {level} cm na! Put down that phone and walk to the Barangay Hall this instant. I'm not asking twice!",
  },
  tl: {
    NORMAL: 'Apo, kalmado pa ang sapa, {level} cm lang. Pero huwag mong iiwan ang tsinelas mo sa ilog, ha!',
    ADVISORY: 'Hoy, apo! {level} cm na ang tubig, tumataas ng {rate} cm kada 10 minuto. Ihanda mo na ang go-bag, hindi mamaya!',
    WARNING: 'Apo! {level} cm na at umaapaw na sa pampang! Iakyat mo ang mga manok at i-charge ang cellphone. Bilis!',
    EVACUATE: "Aba, apo! {level} cm na ang tubig! Bitawan mo 'yang cellphone at pumunta na sa Barangay Hall. Ngayon din!",
  },
  ceb: {
    NORMAL: 'Apo, kalmado pa ang sapa, {level} cm ra. Pero ayaw ibilin imong tsinelas sa suba, ha!',
    ADVISORY: 'Hoy, apo! {level} cm na ang tubig, misaka og {rate} cm matag 10 minutos. Andama na imong go-bag, dili unya!',
    WARNING: 'Apo! {level} cm na ug nag-awas na sa pangpang! Isaka ang mga manok ug i-charge ang cellphone. Dali!',
    EVACUATE: 'Aba, apo, daghan na ang tubig! {level} cm na! Dali, lakaw na sa Barangay Hall. Ayaw na pag-cellphone!',
  },
  war: {
    NORMAL: 'Apo, kalmado pa an sapa, {level} cm la. Pero ayaw igbilin an imo tsinelas ha salog, ha!',
    ADVISORY: 'Hoy, apo! {level} cm na an tubig, nasaka hin {rate} cm kada 10 minuto. Igpreparar na an imo go-bag, diri unina!',
    WARNING: 'Apo! {level} cm na ngan nag-aawas na ha pampang! Isaka an mga manok ngan i-charge an cellphone. Dali!',
    EVACUATE: 'Aba, apo, damu na an tubig! {level} cm na! Dali, kadto na ha Barangay Hall. Ayaw na pag-cellphone!',
  },
};

export interface AlertVars {
  levelCm: number;
  rateCm: number;
}

export function renderTemplate(lang: Lang, status: Status, lola: boolean, v: AlertVars): string {
  const t = TREND[lang];
  const trend = v.rateCm > 3 ? t.up : v.rateCm < -3 ? t.down : t.steady;
  return (lola ? LOLA : OFFICIAL)[lang][status]
    .replaceAll('{level}', v.levelCm.toFixed(0))
    .replaceAll('{rate}', `${v.rateCm >= 0 ? '+' : ''}${v.rateCm.toFixed(0)}`)
    .replaceAll('{trend}', trend);
}
