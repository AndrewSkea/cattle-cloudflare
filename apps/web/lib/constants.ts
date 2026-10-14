import type { Role, Species } from './types'

export const SPECIES: { value: Species; label: string; plural: string; emoji: string; gestationDays?: number }[] = [
  { value: 'cattle', label: 'Cattle', plural: 'Cattle', emoji: '🐄', gestationDays: 283 },
  { value: 'sheep', label: 'Sheep', plural: 'Sheep', emoji: '🐑', gestationDays: 147 },
  { value: 'goat', label: 'Goat', plural: 'Goats', emoji: '🐐', gestationDays: 150 },
  { value: 'pig', label: 'Pig', plural: 'Pigs', emoji: '🐖', gestationDays: 114 },
  { value: 'horse', label: 'Horse', plural: 'Horses', emoji: '🐎', gestationDays: 340 },
  { value: 'poultry', label: 'Poultry', plural: 'Poultry', emoji: '🐓' },
  { value: 'other', label: 'Other', plural: 'Other', emoji: '🐾' },
]
export const speciesInfo = (s: string) => SPECIES.find((x) => x.value === s) || SPECIES[SPECIES.length - 1]

export const CATEGORY_LABELS: Record<string, string> = {
  calf: 'Calves', cow: 'Cows', heifer: 'Heifers', bull: 'Bulls', steer: 'Steers',
  lamb: 'Lambs', ewe: 'Ewes', gimmer: 'Gimmers', ram: 'Rams', wether: 'Wethers',
  kid: 'Kids', doe: 'Does', buck: 'Bucks',
  piglet: 'Piglets', sow: 'Sows', gilt: 'Gilts', boar: 'Boars', barrow: 'Barrows',
  foal: 'Foals', mare: 'Mares', filly: 'Fillies', gelding: 'Geldings', colt: 'Colts', stallion: 'Stallions',
  chick: 'Chicks', hen: 'Hens', cockerel: 'Cockerels', female: 'Female', male: 'Male',
}
export const categorySingular = (c: string) => {
  const map: Record<string, string> = { calves: 'Calf', fillies: 'Filly' }
  const plural = CATEGORY_LABELS[c] || c
  return map[plural.toLowerCase()] || plural.replace(/s$/, '')
}

export const BREEDS: Record<string, string[]> = {
  cattle: ['Aberdeen Angus', 'Belgian Blue', 'British Blue', 'Charolais', 'Hereford', 'Highland', 'Holstein Friesian', 'Limousin', 'Luing', 'Saler', 'Shorthorn', 'Simmental', 'Stabiliser', 'Galloway', 'Welsh Black', 'Jersey'],
  sheep: ['Beltex', 'Blackface', 'Cheviot', 'Herdwick', 'Lleyn', 'Mule', 'Suffolk', 'Texel', 'Romney', 'Swaledale', 'Zwartbles'],
  goat: ['Boer', 'Saanen', 'Toggenburg', 'Anglo-Nubian', 'British Alpine', 'Pygmy'],
  pig: ['Large White', 'Landrace', 'Duroc', 'Gloucestershire Old Spot', 'Tamworth', 'Saddleback', 'Berkshire', 'Pietrain'],
  horse: ['Clydesdale', 'Shire', 'Highland Pony', 'Welsh Cob', 'Thoroughbred', 'Connemara', 'Cob'],
  poultry: ['Rhode Island Red', 'Light Sussex', 'Leghorn', 'Orpington', 'Marans', 'Hybrid'],
  other: [],
}

export const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'On farm', tone: 'green' },
  sold: { label: 'Sold', tone: 'blue' },
  died: { label: 'Died', tone: 'red' },
  culled: { label: 'Culled', tone: 'amber' },
  missing: { label: 'Missing', tone: 'gray' },
}

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'violet' | 'brand'

export const HEALTH_TYPES: { value: string; label: string; tone: Tone }[] = [
  { value: 'vaccination', label: 'Vaccination', tone: 'blue' },
  { value: 'treatment', label: 'Treatment', tone: 'amber' },
  { value: 'test', label: 'Test', tone: 'violet' },
  { value: 'procedure', label: 'Procedure', tone: 'brand' },
  { value: 'vet_visit', label: 'Vet visit', tone: 'green' },
  { value: 'observation', label: 'Observation', tone: 'gray' },
  { value: 'injury', label: 'Injury', tone: 'red' },
]
export const healthType = (t: string) => HEALTH_TYPES.find((x) => x.value === t) || HEALTH_TYPES[5]

export const BIRTH_EASE = [
  { value: 'unassisted', label: 'Unassisted' },
  { value: 'easy_pull', label: 'Easy pull' },
  { value: 'hard_pull', label: 'Hard pull' },
  { value: 'vet', label: 'Vet assisted' },
  { value: 'caesarean', label: 'Caesarean' },
]

export const LAND_USES = [
  { value: 'pasture', label: 'Pasture', color: '#4d9a63' },
  { value: 'silage', label: 'Silage', color: '#b6a33a' },
  { value: 'hay', label: 'Hay', color: '#d4a049' },
  { value: 'arable', label: 'Arable', color: '#a9722d' },
  { value: 'woodland', label: 'Woodland', color: '#275040' },
  { value: 'yard', label: 'Yard', color: '#78716c' },
  { value: 'other', label: 'Other', color: '#6b7280' },
]
export const landUse = (v: string) => LAND_USES.find((x) => x.value === v) || LAND_USES[6]

export const TENURES = [
  { value: 'owned', label: 'Owned' },
  { value: 'rented', label: 'Rented' },
  { value: 'licensed', label: 'Grazing licence' },
  { value: 'other', label: 'Other' },
]

export const STRUCTURE_KINDS = [
  { value: 'barn', label: 'Barn', emoji: '🏚️' },
  { value: 'shed', label: 'Shed', emoji: '🛖' },
  { value: 'yard', label: 'Yard', emoji: '🧱' },
  { value: 'pen', label: 'Pen', emoji: '🚧' },
  { value: 'handling', label: 'Handling system', emoji: '🔗' },
  { value: 'silo', label: 'Silo / clamp', emoji: '🌾' },
  { value: 'water', label: 'Water trough', emoji: '💧' },
  { value: 'gate', label: 'Gate', emoji: '🚪' },
  { value: 'house', label: 'House', emoji: '🏠' },
  { value: 'store', label: 'Store', emoji: '📦' },
  { value: 'other', label: 'Other', emoji: '📍' },
]
export const structureKind = (v: string) => STRUCTURE_KINDS.find((x) => x.value === v) || STRUCTURE_KINDS[10]

export const EQUIPMENT_CATEGORIES = [
  { value: 'tractor', label: 'Tractor' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'trailer', label: 'Trailer' },
  { value: 'implement', label: 'Implement' },
  { value: 'atv', label: 'ATV / UTV' },
  { value: 'handling', label: 'Handling equipment' },
  { value: 'tool', label: 'Tool' },
  { value: 'other', label: 'Other' },
]

export const EQUIPMENT_STATUS: { value: string; label: string; tone: Tone }[] = [
  { value: 'active', label: 'In use', tone: 'green' },
  { value: 'needs_attention', label: 'Needs attention', tone: 'amber' },
  { value: 'in_repair', label: 'In repair', tone: 'red' },
  { value: 'retired', label: 'Retired', tone: 'gray' },
  { value: 'sold', label: 'Sold', tone: 'gray' },
]

export const SERVICE_STATE: Record<string, { label: string; tone: Tone }> = {
  ok: { label: 'Serviced', tone: 'green' },
  due_soon: { label: 'Due soon', tone: 'amber' },
  overdue: { label: 'Overdue', tone: 'red' },
  unknown: { label: 'No schedule', tone: 'gray' },
}

export const EQUIPMENT_LOG_TYPES = [
  { value: 'service', label: 'Service' },
  { value: 'repair', label: 'Repair' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'hours', label: 'Hours reading' },
  { value: 'note', label: 'Note' },
]

export const INVENTORY_CATEGORIES = [
  { value: 'feed', label: 'Feed' },
  { value: 'medicine', label: 'Medicine' },
  { value: 'vaccine', label: 'Vaccine' },
  { value: 'fertiliser', label: 'Fertiliser' },
  { value: 'seed', label: 'Seed' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'bedding', label: 'Bedding' },
  { value: 'parts', label: 'Parts' },
  { value: 'other', label: 'Other' },
]

/** Parts of the app a farm can hide from the menu (Farm settings). Dashboard, Animals, Breeding and Team always show. */
export const HIDEABLE_SECTIONS = [
  { value: 'calendar', label: 'Calendar' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'health', label: 'Health' },
  { value: 'families', label: 'Families' },
  { value: 'traceability', label: 'Traceability' },
  { value: 'land', label: 'Land & map' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'mart', label: 'Mart sales' },
  { value: 'finance', label: 'Finances' },
  { value: 'reports', label: 'Reports' },
]

export const INCOME_CATEGORIES = [
  { value: 'livestock_sales', label: 'Livestock sales' },
  { value: 'subsidies', label: 'Subsidies & grants' },
  { value: 'crop_sales', label: 'Crop & forage sales' },
  { value: 'contracting', label: 'Contracting' },
  { value: 'milk_wool', label: 'Milk, wool & produce' },
  { value: 'rent_received', label: 'Rent received' },
  { value: 'other_income', label: 'Other income' },
]
export const EXPENSE_CATEGORIES = [
  { value: 'feed', label: 'Feed' },
  { value: 'vet_medicine', label: 'Vet & medicine' },
  { value: 'wages', label: 'Wages' },
  { value: 'machinery', label: 'Machinery' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'fertiliser_seed', label: 'Fertiliser & seed' },
  { value: 'rent', label: 'Rent' },
  { value: 'livestock_purchases', label: 'Livestock purchases' },
  { value: 'contractors', label: 'Contractors' },
  { value: 'repairs', label: 'Repairs & maintenance' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'bedding', label: 'Bedding' },
  { value: 'professional_fees', label: 'Professional fees' },
  { value: 'other_expense', label: 'Other expense' },
]
export const categoryLabel = (c: string) =>
  [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].find((x) => x.value === c)?.label || c.replace(/_/g, ' ')

export const ROLE_META: Record<Role, { label: string; description: string; tone: Tone }> = {
  owner: { label: 'Owner', description: 'Full control, including team and deleting the farm', tone: 'brand' },
  manager: { label: 'Manager', description: 'All records and finances; can invite workers and viewers', tone: 'violet' },
  worker: { label: 'Worker', description: 'Record livestock, health, land, equipment, tasks and stock. No finances.', tone: 'blue' },
  viewer: { label: 'Viewer', description: 'Read-only access to farm records. No finances.', tone: 'gray' },
}

export const TASK_PRIORITY: Record<string, { label: string; tone: Tone }> = {
  high: { label: 'High', tone: 'red' },
  normal: { label: 'Normal', tone: 'gray' },
  low: { label: 'Low', tone: 'blue' },
}

export const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full time' },
  { value: 'part_time', label: 'Part time' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'contractor', label: 'Contractor' },
]

// ---------------- Fields: crops, records, readings ----------------

export const CROPS = [
  { value: 'grass', label: 'Grass', color: '#4d9a63' },
  { value: 'grass_clover', label: 'Grass & clover', color: '#62b175' },
  { value: 'spring_barley', label: 'Spring barley', color: '#d4a049' },
  { value: 'winter_barley', label: 'Winter barley', color: '#c08a35' },
  { value: 'oats', label: 'Oats', color: '#dcc06a' },
  { value: 'wheat', label: 'Wheat', color: '#c99b45' },
  { value: 'whole_crop', label: 'Whole crop', color: '#b6a33a' },
  { value: 'turnips', label: 'Turnips', color: '#9b6bb0' },
  { value: 'swedes', label: 'Swedes', color: '#8a62a8' },
  { value: 'kale', label: 'Kale', color: '#3f7f5a' },
  { value: 'fodder_beet', label: 'Fodder beet', color: '#c0605a' },
  { value: 'rape', label: 'Forage rape', color: '#d9c23a' },
  { value: 'maize', label: 'Maize', color: '#e0b030' },
  { value: 'potatoes', label: 'Potatoes', color: '#a9722d' },
  { value: 'other', label: 'Other', color: '#78716c' },
]
export const cropInfo = (v: string) => CROPS.find((x) => x.value === v) || CROPS[CROPS.length - 1]
export const cropLabel = (c: { crop: string; variety?: string | null }) => `${cropInfo(c.crop).label}${c.variety ? ` (${c.variety})` : ''}`

export const CROP_PURPOSES = [
  { value: 'grazing', label: 'Grazing' }, { value: 'silage', label: 'Silage' }, { value: 'hay', label: 'Hay' },
  { value: 'grain', label: 'Grain' }, { value: 'wholecrop', label: 'Whole crop' }, { value: 'forage', label: 'Forage / winter feed' }, { value: 'other', label: 'Other' },
]

export const FIELD_EVENT_TYPES = [
  { value: 'sowing', label: 'Sowing / reseed', short: 'Sowing', color: '#4d9a63' },
  { value: 'fertiliser', label: 'Fertiliser', short: 'Fertiliser', color: '#2f7fb8' },
  { value: 'lime', label: 'Lime', short: 'Lime', color: '#a8a29e' },
  { value: 'slurry', label: 'Slurry / muck', short: 'Slurry', color: '#8a6a3b' },
  { value: 'minerals', label: 'Minerals & trace elements', short: 'Minerals', color: '#7c5cc4' },
  { value: 'spray', label: 'Spray', short: 'Spray', color: '#d9483b' },
  { value: 'cultivation', label: 'Field work', short: 'Field work', color: '#57534e' },
  { value: 'harvest', label: 'Harvest / cut', short: 'Harvest', color: '#d4a049' },
  { value: 'grazing', label: 'Grazing', short: 'Grazing', color: '#2e7d4f' },
  { value: 'soil_test', label: 'Soil test', short: 'Soil test', color: '#b45309' },
  { value: 'reading', label: 'Readings', short: 'Readings', color: '#0e7490' },
  { value: 'note', label: 'Note', short: 'Note', color: '#a8a29e' },
] as const
export type FieldEventType = (typeof FIELD_EVENT_TYPES)[number]['value']
export const fieldEventType = (v: string) => FIELD_EVENT_TYPES.find((x) => x.value === v) || FIELD_EVENT_TYPES[FIELD_EVENT_TYPES.length - 1]

/** Field work suggestions (free text is fine too). */
export const FIELD_OPERATIONS = ['Ploughing', 'Power harrowing', 'Discing', 'Rolling', 'Harrowing (chain)', 'Topping', 'Direct drilling', 'Stone picking', 'Subsoiling', 'Hedge cutting', 'Fencing', 'Drainage', 'Ditching']
export const SPRAY_SUGGESTIONS = ['Thistles / docks (herbicide)', 'Rushes (herbicide)', 'Weed control (cereal)', 'Fungicide', 'Insecticide', 'Glyphosate (burn-off)']

export const RATE_UNITS = [
  { value: 'kg/ha', label: 'kg/ha' }, { value: 'kg/ac', label: 'kg/acre' }, { value: 'bags/ac', label: 'bags (50 kg)/acre' },
  { value: 't/ha', label: 't/ha' }, { value: 't/ac', label: 't/acre' }, { value: 'm3/ha', label: 'm³/ha' },
  { value: 'gal/ac', label: 'gallons/acre' }, { value: 'L/ha', label: 'L/ha' }, { value: 'L/ac', label: 'L/acre' },
]
export const YIELD_UNITS = [
  { value: 'bales', label: 'bales' }, { value: 'round_bales', label: 'round bales' }, { value: 'square_bales', label: 'small bales' },
  { value: 't', label: 'tonnes' }, { value: 't/ha', label: 't/ha' }, { value: 'pits', label: 'pit loads' }, { value: 'trailers', label: 'trailer loads' },
]

/** Typical nutrients per unit of organic manure (RB209, 2017): kg per m³ (slurry) or per tonne (FYM). */
export const MANURE_PRESETS = [
  { value: 'cattle_slurry_6', label: 'Cattle slurry (6% DM)', unit: 'm3', n: 2.6, p: 1.2, k: 2.5, s: 0.7 },
  { value: 'cattle_slurry_2', label: 'Cattle slurry, thin (2% DM)', unit: 'm3', n: 1.6, p: 0.6, k: 1.6, s: 0.3 },
  { value: 'cattle_fym', label: 'Cattle FYM (muck)', unit: 't', n: 6.0, p: 3.2, k: 8.0, s: 2.4 },
  { value: 'sheep_fym', label: 'Sheep FYM', unit: 't', n: 7.0, p: 3.2, k: 8.0, s: 4.0 },
  { value: 'poultry', label: 'Poultry litter', unit: 't', n: 19, p: 8.0, k: 9.9, s: 5.6 },
]

export const READING_KINDS = [
  { value: 'soil_moisture', label: 'Soil moisture', unit: '%', min: 10, max: 50, low: 'Dry', high: 'Wet', palette: 'wet' },
  { value: 'grass_height', label: 'Grass height', unit: 'cm', min: 2, max: 15, low: 'Short', high: 'Long', palette: 'grow' },
  { value: 'grass_cover', label: 'Grass cover', unit: 'kg DM/ha', min: 1200, max: 3500, low: 'Low', high: 'High', palette: 'grow' },
  { value: 'crop_moisture', label: 'Crop moisture', unit: '%', min: 12, max: 30, low: 'Dry', high: 'Wet', palette: 'wet' },
  { value: 'dry_matter', label: 'Dry matter', unit: '%', min: 15, max: 45, low: 'Wet', high: 'Dry', palette: 'grow' },
  { value: 'ph', label: 'Soil pH', unit: 'pH', min: 5, max: 7, low: 'Acid', high: 'Neutral', palette: 'grow' },
  { value: 'p_index', label: 'P index', unit: 'index', min: 0, max: 4, low: '0', high: '4', palette: 'grow' },
  { value: 'k_index', label: 'K index', unit: 'index', min: 0, max: 4, low: '0', high: '4', palette: 'grow' },
  { value: 'mg_index', label: 'Mg index', unit: 'index', min: 0, max: 4, low: '0', high: '4', palette: 'grow' },
  { value: 'organic_matter', label: 'Organic matter', unit: '%', min: 2, max: 12, low: 'Low', high: 'High', palette: 'grow' },
  { value: 'soil_temp', label: 'Soil temperature', unit: '°C', min: 0, max: 15, low: 'Cold', high: 'Warm', palette: 'warm' },
  { value: 'other', label: 'Other', unit: '', min: 0, max: 100, low: 'Low', high: 'High', palette: 'grow' },
] as const
export type ReadingKind = (typeof READING_KINDS)[number]['value']
export const readingKind = (v: string) => READING_KINDS.find((x) => x.value === v) || READING_KINDS[READING_KINDS.length - 1]
export const SOIL_TEST_KINDS: ReadingKind[] = ['ph', 'p_index', 'k_index', 'mg_index', 'organic_matter']

const PALETTES: Record<string, [number, number, number][]> = {
  wet: [[214, 160, 73], [237, 226, 160], [120, 190, 210], [37, 99, 175]],
  grow: [[201, 74, 59], [230, 190, 80], [140, 190, 90], [46, 125, 79]],
  warm: [[59, 110, 190], [140, 190, 220], [240, 200, 90], [214, 96, 50]],
}
/** Colour for a reading on its kind's scale (min → max). */
export function readingColor(kind: string, value: number): string {
  const k = readingKind(kind)
  const pal = PALETTES[k.palette]
  const t = Math.max(0, Math.min(1, (value - k.min) / (k.max - k.min || 1))) * (pal.length - 1)
  const i = Math.min(pal.length - 2, Math.floor(t)), f = t - i
  const c = pal[i].map((v, j) => Math.round(v + (pal[i + 1][j] - v) * f))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}
export const readingGradient = (kind: string) => {
  const k = readingKind(kind)
  return `linear-gradient(to right, ${[0, 0.33, 0.66, 1].map((t) => readingColor(kind, k.min + t * (k.max - k.min))).join(', ')})`
}
