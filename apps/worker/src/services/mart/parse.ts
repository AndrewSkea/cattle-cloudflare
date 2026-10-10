/**
 * Parser for Orkney Auction Mart sales reports (WordPress "The Events Calendar" descriptions).
 *
 * A report is a list of <p> lines: narrative sentences ("Prime Steers topped at £2671 for an Aberdeen Angus
 * scaling 740 kilos from B & M Eunson, Staye, Deerness."), section headers ("OTHER STEERS PER KILO") and
 * lot rows ("Maesquoy,Harray   480   £2,200 458.3   BRB"). Pure functions — no I/O.
 */

export interface ParsedLot {
  section: string;           // header or narrative class, e.g. "OTHER STEERS PER KILO" / "Prime Steers"
  category: LotCategory;
  species: 'cattle' | 'sheep';
  basis: 'kg' | 'head';
  sellerKey: string;          // normalised "place,parish", e.g. "staye,deerness"
  seller: string;             // as printed, e.g. "Staye, Deerness" or "B & M Eunson, Staye, Deerness"
  weightKg: number | null;
  price: number;              // £ per head
  pricePerKg: number | null;  // pence per kg
  breedCode: string | null;
  headCount: number;
  buyer: string | null;
  top: boolean;               // from a narrative "topped at" line
  raw: string;
}

export type LotCategory =
  | 'steers' | 'heifers' | 'bulls' | 'cows' | 'otm' | 'calves' | 'breeding'
  | 'lambs' | 'hoggs' | 'ewes' | 'rams' | 'gimmers' | 'shearlings' | 'other';

const CATTLE: LotCategory[] = ['steers', 'heifers', 'bulls', 'cows', 'otm', 'calves', 'breeding'];

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;|&rsquo;|&lsquo;/g, "'").replace(/&hellip;/g, '…')
    .replace(/&ndash;|&mdash;/g, '-').replace(/&pound;/g, '£');
}

/** "Staye,  Deerness" / "STAYE,DEERNESS" → "staye,deerness". */
export function sellerKey(s: string): string {
  return s.toLowerCase().replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').replace(/[^a-z0-9 ,'&-]/g, '').trim();
}

export function categorise(text: string): { category: LotCategory; species: 'cattle' | 'sheep' } {
  const t = text.toLowerCase();
  const cat = (category: LotCategory) => ({ category, species: CATTLE.includes(category) ? 'cattle' as const : 'sheep' as const });
  if (/\botm\b|over thirty|cast cows?|cull cows?/.test(t)) return cat('otm');
  if (/calf|calves/.test(t) && !/in calf/.test(t)) return cat('calves');
  if (/in calf|breeding (cattle|heifers|cows)|bulling/.test(t)) return cat('breeding');
  if (/steer|bullock/.test(t)) return cat('steers');
  if (/heifer/.test(t)) return cat('heifers');
  if (/\bbulls?\b|charolais|aged bulls/.test(t) && !/ram/.test(t)) return cat('bulls');
  if (/\bcows?\b/.test(t)) return cat('cows');
  if (/lamb/.test(t)) return cat('lambs');
  if (/hogg/.test(t)) return cat('hoggs');
  if (/gimmer/.test(t)) return cat('gimmers');
  if (/shearling/.test(t)) return cat('shearlings');
  if (/\brams?\b|tup/.test(t)) return cat('rams');
  if (/ewe|cast sheep/.test(t)) return cat('ewes');
  if (/cattle|prime|store/.test(t)) return cat('other');
  return { category: 'other', species: /sheep/.test(t) ? 'sheep' : 'cattle' };
}

function num(s: string | undefined | null): number | null {
  if (s == null) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Splits description HTML into plain text lines. */
export function reportLines(html: string): string[] {
  const parts = html.split(/<\/p>|<br\s*\/?>|<\/li>|<\/h\d>|<\/tr>/i);
  const out: string[] = [];
  for (const p of parts) {
    const t = decodeEntities(p.replace(/<\/t[dh]>/gi, '\t').replace(/<[^>]+>/g, '')).replace(/ /g, ' ').trim();
    if (t) out.push(...t.split(/\n+/).map((x) => x.trim()).filter(Boolean));
  }
  return out;
}

// "Place,Parish  [weight]  £price  [p/kg]  BREED"
const ROW = /^(?<seller>[^£,][^£,]*?,\s*[^£\d]+?)\s+(?:(?<w>\d{1,4}(?:\.\d+)?)\s+)?£\s?(?<price>\d[\d,]*(?:\.\d+)?)(?:\s+(?<ppk>\d{2,4}(?:\.\d+)?))?(?:\s+(?<breed>[A-Za-z][A-Za-z ./x-]{0,24}))?$/;
// Some reports print p/kg before the price: "Mooness, Holm 570 268.4 £1,530.00 LIM"
const ALT = /^(?<seller>[^£,\d][^£,]*?,\s*[^£\d]+?)\s+(?<w>\d{2,4})\s+(?<ppk>\d{2,4}(?:\.\d+)?)\s+£\s?(?<price>\d[\d,]*(?:\.\d+)?)(?:\s+(?<breed>[A-Za-z][A-Za-z ./x-]{0,24}))?$/;
// Show & sale tables: "1st Lot 5. Spence, Norton, Dounby   675 kilos   £2227   330p   Williamsons"
const SHOW = /^(?:\d(?:st|nd|rd|th)\s+)?(?:Lot\s*\d+\.?\s*)?(?<seller>[^£\d][^£]*?,[^£\d]+?)\s+(?<w>\d{2,4}(?:\.\d+)?)\s*(?:kilos?)?\s+£\s?(?<price>\d[\d,]*(?:\.\d+)?)\s+(?<ppk>\d{2,4}(?:\.\d+)?)p?\s*(?<buyer>[A-Za-z].*)?$/;
const HEADER = /^[A-Z0-9][A-Z0-9 &/'().,+-]{3,}$/;

const BREEDS: Record<string, string> = {
  'aberdeen angus': 'AA', angus: 'AA', charolais: 'CH', limousin: 'LIM', simmental: 'SIM', shorthorn: 'SH',
  hereford: 'HER', 'british blue': 'BB', 'belgian blue': 'BB', salers: 'SAL', saler: 'SAL', 'blonde': 'BA',
  galloway: 'GAL', highland: 'HIGH', stabiliser: 'STAB', texel: 'TEX', suffolk: 'SUF', cheviot: 'CHEV',
  charollais: 'CHAR', beltex: 'BELT', 'blue texel': 'BTEX', 'dutch spotted': 'DUTCH SP',
};

function breedFromWords(s: string): string | null {
  const t = s.toLowerCase();
  for (const [name, code] of Object.entries(BREEDS)) if (t.includes(name)) return code;
  return null;
}

/**
 * Parses a narrative sentence such as
 *   "Prime Heifers topped at 370 p/kg for a Charolais scaling 655 kilos from D Taylor, Hall of Herston,
 *    South Ronaldsay realising £2423 purchased by Williamsons."
 */
function parseNarrative(sentence: string): ParsedLot | null {
  const from = sentence.match(/\bfrom ([^.]+?)(?:\s+(?:realising|which|and also|and a|purchased|sold)\b|\.|$)/i);
  if (!from) return null;
  const sellerRaw = from[1].trim().replace(/[,\s]+$/, '');
  const segs = sellerRaw.split(/\s*,\s*/).filter(Boolean);
  if (segs.length < 2) return null;
  const klass = sentence.match(/^(.*?)\s+(?:topped|averaged|sold|realised|realising|was)\b/i)?.[1]
    ?? sentence.match(/^Top price per head was/i)?.[0] ?? 'Top price';
  const ppk = num(sentence.match(/(\d{2,4}(?:\.\d+)?)\s*p\/kg/i)?.[1]);
  const pounds = [...sentence.matchAll(/£\s?(\d[\d,]*(?:\.\d+)?)/g)].map((m) => num(m[1])!).filter((x) => x != null);
  const weight = num(sentence.match(/scaling\s+(\d{2,4}(?:\.\d+)?)\s*kilos?/i)?.[1]);
  let price = pounds.length ? pounds[pounds.length - 1] : null;
  if (price == null && ppk && weight) price = Math.round(ppk * weight) / 100;
  if (price == null) return null;
  const forPart = sentence.match(/\bfor (?:a |an )?(?:pen of |pair of )?(\d+)?\s*([A-Za-z][^,]*?)(?:\s+scaling|\s+from|\s+in calf|$)/i);
  const headCount = /pair of/i.test(sentence) ? 2 : num(forPart?.[1] ?? null) ?? 1;
  const { category, species } = categorise(`${klass} ${forPart?.[2] ?? ''}`);
  const buyer = sentence.match(/purchased by ([^.]+?)\.?$/i)?.[1]?.trim() ?? null;
  return {
    section: klass.trim(),
    category, species,
    basis: ppk ? 'kg' : 'head',
    sellerKey: sellerKey(segs.slice(-2).join(',')),
    seller: segs.join(', '),
    weightKg: weight,
    price,
    pricePerKg: ppk,
    breedCode: breedFromWords(forPart?.[2] ?? sentence),
    headCount: headCount || 1,
    buyer,
    top: true,
    raw: sentence,
  };
}

export function parseReport(html: string, title = ''): ParsedLot[] {
  return dedupe(parseLines(html, title));
}

/**
 * The same animal is often printed twice — once under "PER KILO" and again under "PER HEAD". Rows with the
 * same seller, weight, price and breed are merged, keeping the p/kg figure.
 */
function dedupe(lots: ParsedLot[]): ParsedLot[] {
  const seen = new Map<string, ParsedLot>();
  const out: ParsedLot[] = [];
  for (const l of lots) {
    const key = [l.sellerKey, l.category, l.weightKg ?? '', l.price, l.top ? '' : (l.breedCode ?? '')].join('|');
    const twin = seen.get(key) ?? (l.top ? undefined : seen.get([l.sellerKey, l.category, l.weightKg ?? '', l.price, ''].join('|')));
    if (twin) {
      twin.pricePerKg ??= l.pricePerKg;
      if (twin.pricePerKg != null) twin.basis = 'kg';
      twin.breedCode ??= l.breedCode;
      continue;
    }
    seen.set(key, l);
    if (l.top) seen.set([l.sellerKey, l.category, l.weightKg ?? '', l.price, ''].join('|'), l);
    out.push(l);
  }
  return out;
}

export interface MarketAverage { label: string; category: LotCategory; species: 'cattle' | 'sheep'; unit: 'ppk' | 'gbp'; value: number }

/** "Store Steers averaged 394.1 p/kg (+2.8p)" / "Store Lambs averaged £73.08" → market averages for the day. */
export function parseAverages(html: string): MarketAverage[] {
  const out: MarketAverage[] = [];
  for (const line of reportLines(html)) {
    for (const m of line.matchAll(/([A-Z][A-Za-z0-9 +.\-/]*?)\s+av[a-z]{3,6}ed\s+(?:£\s?(\d[\d,]*(?:\.\d+)?)|(\d{2,4}(?:\.\d+)?)\s*p\/kg)/g)) {
      const label = m[1].trim();
      if (/\bfrom\b/i.test(label) || label.length > 40) continue;
      const { category, species } = categorise(label);
      const value = num(m[2] ?? m[3]);
      if (value == null) continue;
      out.push({ label, category, species, unit: m[2] ? 'gbp' : 'ppk', value });
    }
  }
  return out;
}

export function parseLines(html: string, title: string): ParsedLot[] {
  const lots: ParsedLot[] = [];
  let section = title;
  let sectionCat = categorise(title);
  let basis: 'kg' | 'head' = 'head';
  for (const line of reportLines(html)) {
    const tabbed = line.replace(/\t+/g, '  ');
    const m = tabbed.match(ROW);
    if (m?.groups && !/topped|averaged|\bfrom\b/i.test(line)) {
      const g = m.groups;
      const price = num(g.price);
      if (price == null) continue;
      const ppk = num(g.ppk ?? null);
      let weight = num(g.w ?? null);
      // Sheep rows sometimes print weight-per-head (e.g. 46.5) — keep it; cattle weights are whole kilos.
      if (weight != null && weight < 10) weight = null;
      lots.push({
        section, category: sectionCat.category, species: sectionCat.species,
        basis: ppk != null || /PER KILO/i.test(section) ? 'kg' : basis,
        sellerKey: sellerKey(g.seller), seller: g.seller.replace(/\s*,\s*/g, ', ').trim(),
        weightKg: weight, price, pricePerKg: ppk, breedCode: g.breed?.trim().toUpperCase() || null,
        headCount: 1, buyer: null, top: false, raw: line,
      });
      continue;
    }
    const alt = m ? null : tabbed.match(ALT);
    if (alt?.groups) {
      const g = alt.groups;
      lots.push({
        section, category: sectionCat.category, species: sectionCat.species, basis: 'kg',
        sellerKey: sellerKey(g.seller), seller: g.seller.replace(/\s*,\s*/g, ', ').trim(),
        weightKg: num(g.w), price: num(g.price)!, pricePerKg: num(g.ppk), breedCode: g.breed?.trim().toUpperCase() || null,
        headCount: 1, buyer: null, top: false, raw: line,
      });
      continue;
    }
    const sm = m ? null : tabbed.match(SHOW);
    if (sm && sm.groups && !/topped|averaged|\bfrom\b|awarded/i.test(line)) {
      const g = sm.groups;
      const segs = g.seller.split(/\s*,\s*/).filter(Boolean);
      const weight = num(g.w);
      const cat = categorise(`${section} ${weight != null && weight < 120 ? 'lamb' : ''}`);
      lots.push({
        section, category: cat.category === 'other' && weight != null && weight < 120 ? 'lambs' : cat.category,
        species: weight != null && weight < 120 ? 'sheep' : cat.species, basis: 'kg',
        sellerKey: sellerKey(segs.slice(-2).join(',')), seller: segs.join(', '),
        weightKg: weight, price: num(g.price)!, pricePerKg: num(g.ppk), breedCode: null,
        headCount: 1, buyer: g.buyer?.trim() || null, top: false, raw: line,
      });
      continue;
    }
    if (HEADER.test(line) && !line.includes('£')) {
      section = line;
      sectionCat = categorise(line);
      basis = /PER KILO/.test(line) ? 'kg' : 'head';
      continue;
    }
    if (/\bfrom\b/i.test(line) && /£|p\/kg/i.test(line)) {
      // A line can hold several sentences ("… Texel. Cast Sheep topped at …").
      for (const sentence of line.split(/(?<=\.)\s+(?=[A-Z])/)) {
        const lot = parseNarrative(sentence.trim());
        if (lot) lots.push(lot);
      }
    }
  }
  return lots;
}

/** "Forward on Monday were 7 Prime, 1277 Store & 18 OTM Cattle." etc. — the report's opening lines. */
export function reportSummary(html: string): string {
  return reportLines(html).filter((l) => /forward|averaged/i.test(l) && !/\bfrom\b/i.test(l)).slice(0, 8).join('\n');
}

/** "OTHER PRIME STEERS PER KILO" → "Prime steers (per kg)". */
export function prettySection(s: string): string {
  if (!s) return s;
  const keep = new Set(['OTM', 'AA', 'HISHA', 'OSBA', 'OBBA', 'SQQ', 'X']);
  let t = s.trim().toUpperCase().replace(/^OTHER\s+/, '');
  const basis = /PER KILO$/.test(t) ? ' (per kg)' : /PER HEAD$/.test(t) ? ' (per head)' : '';
  t = t.replace(/\s+PER (KILO|HEAD)$/, '');
  const words = t.split(/\s+/).map((w, i) => keep.has(w) ? w : i === 0 ? w[0] + w.slice(1).toLowerCase() : w.toLowerCase());
  return words.join(' ') + basis;
}
