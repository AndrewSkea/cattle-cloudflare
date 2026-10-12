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
