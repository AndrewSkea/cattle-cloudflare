export type Role = 'owner' | 'manager' | 'worker' | 'viewer'
export type Species = 'cattle' | 'sheep' | 'goat' | 'pig' | 'horse' | 'poultry' | 'other'

export interface Farm {
  id: number
  name: string
  holdingNumber: string | null
  herdMark: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  zoom: number | null
  boundary: string | null
  currency: string
  areaUnit: 'ha' | 'ac'
  species: Species[]
  /** Menu sections this farm has hidden (see HIDEABLE_SECTIONS) */
  hiddenSections: string[]
}

export interface Me {
  user: { id: number; email: string; name: string | null; avatarUrl: string | null; phone: string | null; createdAt: string }
  farms: { id: number; name: string; role: Role; joinedAt: string; expiresAt: string | null }[]
  farm: Farm | null
  role: Role | null
}

export interface Animal {
  id: number
  species: Species
  tagNo: string
  managementTag: string | null
  name: string | null
  sex: 'female' | 'male'
  castrated: boolean
  breed: string | null
  colour: string | null
  dob: string | null
  birthYear: number | null
  damId: number | null
  sireId: number | null
  sireName: string | null
  size: number | null
  parcelId: number | null
  structureId: number | null
  status: 'active' | 'sold' | 'died' | 'culled' | 'missing'
  origin: 'born' | 'purchased'
  purchaseDate: string | null
  purchasePrice: number | null
  purchaseSource: string | null
  exitDate: string | null
  exitReason: string | null
  salePrice: number | null
  saleWeightKg: number | null
  buyer: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  // computed
  ageMonths: number | null
  category: string
}

export interface AnimalListItem extends Animal {
  damTag: string | null
  sireTag: string | null
  parcelName: string | null
  structureName: string | null
  offspringCount: number
  latestWeightKg: number | null
  latestWeightDate: string | null
  withdrawalUntil: string | null
}

export interface AnimalDetail extends Animal {
  dam: { id: number; tagNo: string; managementTag: string | null; name: string | null; breed: string | null } | null
  sire: { id: number; tagNo: string; managementTag: string | null; name: string | null; breed: string | null } | null
  parcel: { id: number; name: string } | null
  structure: { id: number; name: string } | null
  offspringCount: number
  birthCount: number
  tagHistory: { previousTag: string; newTag: string | null; changedOn: string }[]
}

export interface AnimalOption {
  id: number
  tagNo: string
  managementTag: string | null
  name: string | null
  sex: 'female' | 'male'
  species: Species
  status: string
  dob: string | null
  breed: string | null
  formerTags: string | null
}

export interface HealthRecord {
  id: number
  animalId: number
  animalTag?: string
  date: string
  type: string
  title: string
  product: string | null
  dose: string | null
  batchNo: string | null
  administeredBy: string | null
  vet: string | null
  result: string | null
  withdrawalMeatUntil: string | null
  withdrawalMilkUntil: string | null
  nextDueDate: string | null
  cost: number | null
  notes: string | null
  overdue?: boolean
}

export interface WeightRecord { id: number; animalId: number; animalTag?: string; date: string; weightKg: number; conditionScore: number | null; notes: string | null }

export interface BreedingRecord {
  id: number
  animalId: number
  animalTag?: string
  animalStatus?: string
  event: 'service' | 'scan' | 'heat'
  date: string
  method: string | null
  sireId: number | null
  sireName: string | null
  sireTag?: string | null
  scanResult: string | null
  fetusCount: number | null
  expectedDueDate: string | null
  outcome: 'pending' | 'born' | 'failed' | 'aborted'
  notes: string | null
  overdue?: boolean
}

export interface BirthRecord {
  id: number
  damId: number
  damTag?: string
  offspringId: number | null
  offspringTag?: string | null
  date: string
  sex: string | null
  sireId: number | null
  sireName: string | null
  sireTag?: string | null
  ease: string | null
  outcome: 'alive' | 'stillborn' | 'died'
  birthWeightKg: number | null
  notes: string | null
}

export interface Movement {
  id: number
  animalId: number
  animalTag?: string
  date: string
  fromParcelName: string | null
  toParcelName: string | null
  toStructureName: string | null
  notes: string | null
}

export interface Parcel {
  id: number
  name: string
  landUse: string
  tenure: string
  rentAnnual: number | null
  polygon: string | null
  areaHa: number | null
  color: string | null
  soilType: string | null
  capacity: number | null
  notes: string | null
  animalCount: number
  animalsBySpecies: Record<string, number>
}

export interface Structure {
  id: number
  name: string
  kind: string
  latitude: number | null
  longitude: number | null
  parcelId: number | null
  capacity: number | null
  condition: string | null
  notes: string | null
  animalCount: number
}

export interface Equipment {
  id: number
  name: string
  category: string
  make: string | null
  model: string | null
  year: number | null
  registration: string | null
  serialNumber: string | null
  purchaseDate: string | null
  purchasePrice: number | null
  status: string
  hours: number | null
  serviceIntervalHours: number | null
  serviceIntervalMonths: number | null
  lastServiceDate: string | null
  lastServiceHours: number | null
  motDue: string | null
  insuranceDue: string | null
  notes: string | null
  serviceState: 'ok' | 'due_soon' | 'overdue' | 'unknown'
  serviceReasons: string[]
  nextServiceDate: string | null
  nextServiceHours: number | null
}

export interface EquipmentLog {
  id: number
  date: string
  type: string
  hours: number | null
  cost: number | null
  description: string | null
  performedBy: string | null
}

export interface Task {
  id: number
  title: string
  description: string | null
  dueDate: string | null
  priority: 'low' | 'normal' | 'high'
  status: 'todo' | 'in_progress' | 'done'
  category: string | null
  assigneeUserId: number | null
  assigneeName?: string | null
  animalId: number | null
  animalTag?: string | null
  equipmentId: number | null
  equipmentName?: string | null
  parcelId: number | null
  parcelName?: string | null
  completedAt: string | null
  overdue?: boolean
}

export interface InventoryItem {
  id: number
  name: string
  category: string
  quantity: number
  unit: string
  reorderLevel: number | null
  unitCost: number | null
  supplier: string | null
  location: string | null
  batchNo: string | null
  expiryDate: string | null
  notes: string | null
  lowStock: boolean
  expired: boolean
  expiringSoon: boolean
}

export interface Transaction {
  id: number
  type: 'income' | 'expense'
  category: string
  amount: number
  vatAmount: number | null
  date: string
  description: string | null
  counterparty: string | null
  reference: string | null
  animalId: number | null
  animalTag?: string | null
  equipmentId: number | null
  equipmentName?: string | null
  parcelId: number | null
  parcelName?: string | null
  staffId: number | null
  staffName?: string | null
  source: string | null
}

export interface StaffMember {
  id: number
  userId: number | null
  name: string
  email: string | null
  phone: string | null
  jobTitle: string | null
  employmentType: string
  payRate?: number | null
  payUnit?: string | null
  startDate: string | null
  endDate: string | null
  emergencyContact?: string | null
  notes?: string | null
}

export interface Member {
  userId: number
  name: string | null
  email: string
  avatarUrl: string | null
  role: Role
  joinedAt: string
  expiresAt: string | null
  lastLoginAt: string | null
}

export interface Invite {
  id: number
  code: string
  role: Role
  email: string | null
  note: string | null
  maxUses: number | null
  usedCount: number
  accessDays: number | null
  expiresAt: string | null
  createdAt: string
}

export interface FamilyStats {
  count: number
  active: number
  females: number
  males: number
  totalBirths: number
  avgCalvingIntervalDays: number | null
  avgAgeFirstBirthMonths: number | null
  birthLossRate: number | null
  assistedRate: number | null
  avgDailyGainKg: number | null
  avgLatestWeightKg: number | null
  soldCount: number
  avgSalePrice: number | null
  avgSaleWeightKg: number | null
  avgSaleAgeMonths: number | null
  totalSales: number | null
}

export interface TreeNode {
  id: number
  tagNo: string
  managementTag: string | null
  name: string | null
  sex: string
  breed: string | null
  dob: string | null
  status: string
  children: TreeNode[]
}

export interface PedigreeNode {
  id: number
  tagNo: string
  managementTag: string | null
  name: string | null
  sex: string
  breed: string | null
  dob: string | null
  status: string
  sireName?: string | null
  dam: PedigreeNode | null
  sire: PedigreeNode | null
}

export interface FamilyTreeNode {
  id: number
  tagNo: string
  managementTag: string | null
  name: string | null
  sex: 'female' | 'male'
  castrated: boolean
  breed: string | null
  dob: string | null
  birthYear: number | null
  status: string
  exitDate: string | null
  exitReason: string | null
  ageMonths: number | null
  latestWeightKg: number | null
  latestWeightDate: string | null
  salePrice: number | null
  saleWeightKg: number | null
  sireName: string | null
  offspring: number
}

export interface FamilyTreeUp { id: number | null; sireName?: string | null; dam: FamilyTreeUp | null; sire: FamilyTreeUp | null }

export interface FamilyTree {
  rootId: number
  up: FamilyTreeUp | null
  down: { id: number; children: FamilyTree['down'][] }
  nodes: Record<number, FamilyTreeNode>
}

export interface FamilyReport {
  pedigree: PedigreeNode
  descendants: TreeNode
  siblings: Omit<TreeNode, 'children'>[]
  founder: Omit<TreeNode, 'children'> | null
  generations: number
  self: FamilyStats
  offspring: FamilyStats
  descendantStats: FamilyStats
  herd: FamilyStats
}

export interface MartMatch {
  id: number
  status: 'new' | 'imported' | 'dismissed'
  decidedAt: string | null
  lotId: number
  date: string
  section: string
  category: string
  species: 'cattle' | 'sheep'
  basis: 'kg' | 'head'
  seller: string
  weightKg: number | null
  price: number
  pricePerKg: number | null
  ppkDerived: boolean
  breedCode: string | null
  breed: string | null
  headCount: number
  buyer: string | null
  top: boolean
  raw: string
  reportId: number
  reportTitle: string
  reportUrl: string
  marketPpk: number | null
  marketLabel: string | null
  animals: { id: number; tagNo: string; managementTag: string | null }[]
}

export interface MartCandidate {
  id: number; tagNo: string; managementTag: string | null; name: string | null; sex: string; castrated: boolean
  breed: string | null; dob: string | null; status: string; ageMonths: number | null; lastWeightKg: number | null
  score: number; reasons: string[]
}

export interface MartOverview {
  sellers: string[]
  lastSyncAt: string | null
  counts: { new: number; imported: number; dismissed: number }
  reports: number
  latestReport: string | null
}

export type FeedbackStatus = 'saved' | 'queued' | 'working' | 'needs_info' | 'failed' | 'live'

export interface FeedbackItem {
  id: number
  kind: 'bug' | 'idea' | 'change'
  message: string
  page: string | null
  issueNumber: number | null
  issueUrl: string | null
  status: FeedbackStatus
  question: string | null
  userId: number
  userName: string
  createdAt: string
}

export interface FieldCrop {
  id: number
  parcelId: number
  crop: string
  variety: string | null
  purpose: string
  status: 'planned' | 'growing' | 'finished'
  startDate: string | null
  expectedHarvest: string | null
  endDate: string | null
  notes: string | null
}

export interface FieldReading {
  id?: number
  kind: string
  label: string | null
  value: number
  unit: string | null
  latitude: number | null
  longitude: number | null
  date?: string
  eventId?: number
}

export interface FieldEvent {
  id: number
  parcelId: number
  cropId: number | null
  type: string
  status: 'done' | 'planned'
  date: string
  endDate: string | null
  product: string | null
  rate: number | null
  rateUnit: string | null
  areaHa: number | null
  nKgHa: number | null
  pKgHa: number | null
  kKgHa: number | null
  sKgHa: number | null
  yieldAmount: number | null
  yieldUnit: string | null
  moisturePct: number | null
  dryMatterPct: number | null
  noGrazeUntil: string | null
  cost: number | null
  contractor: string | null
  equipmentId: number | null
  notes: string | null
  readings: FieldReading[]
}

export interface FieldGrazing { head: number; since: string | null; lastOut: string | null; restDays: number | null }

export interface FieldDetail {
  parcel: Parcel
  crops: FieldCrop[]
  events: FieldEvent[]
  grazing: FieldGrazing & { history: { date: string; in: number; out: number }[] }
}

export interface FieldSummary {
  parcelId: number
  crop: FieldCrop | null
  nextCrop: FieldCrop | null
  lastEvent: { type: string; date: string; product: string | null } | null
  nextPlanned: { type: string; date: string; product: string | null } | null
  plannedCount: number
  noGrazeUntil: string | null
  nutrients: { n: number; p: number; k: number }
  lastSoilTest: string | null
  lastPh: { value: number; date: string } | null
  grazing: FieldGrazing
}

export interface FieldsOverview {
  year: number
  fields: FieldSummary[]
  crops: FieldCrop[]
  events: { id: number; parcelId: number; type: string; status: string; date: string; endDate: string | null; product: string | null }[]
  planned: { id: number; parcelId: number; type: string; date: string; product: string | null }[]
}
