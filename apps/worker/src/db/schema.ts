/**
 * Drizzle ORM schema — Farm management (v2)
 *
 * Every farm-owned table carries `farm_id`; every query must be scoped by it.
 * Dates are ISO `YYYY-MM-DD` strings, timestamps are ISO datetime strings.
 */

import { sqliteTable, integer, text, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const createdAt = () => text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () => text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`);

// ==================== IDENTITY ====================

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  googleId: text('google_id').unique(), // null until first Google sign-in (pre-provisioned users)
  email: text('email').notNull().unique(), // always lower-case
  name: text('name'),
  avatarUrl: text('avatar_url'),
  phone: text('phone'),
  lastFarmId: integer('last_farm_id'),
  lastLoginAt: text('last_login_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const farms = sqliteTable('farms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  holdingNumber: text('holding_number'), // e.g. UK CPH number
  herdMark: text('herd_mark'), // APHA herd mark, e.g. 523801 (first 6 digits of UK cattle tags)
  address: text('address'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  zoom: integer('zoom'),
  boundary: text('boundary'), // GeoJSON Polygon geometry
  currency: text('currency').notNull().default('GBP'),
  areaUnit: text('area_unit').notNull().default('ha'), // ha | ac
  species: text('species').notNull().default('["cattle"]'), // JSON array of species kept
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const farmMembers = sqliteTable('farm_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // owner | manager | worker | viewer
  joinedAt: text('joined_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text('expires_at'),
  removedAt: text('removed_at'),
}, (t) => ({
  farmUser: uniqueIndex('ux_member_farm_user').on(t.farmId, t.userId),
  user: index('idx_member_user').on(t.userId),
}));

export const farmInvites = sqliteTable('farm_invites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  role: text('role').notNull(),
  email: text('email'), // optional: restrict to this address
  note: text('note'),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').notNull().default(0),
  accessDays: integer('access_days'), // membership length; null = permanent
  expiresAt: text('expires_at'), // link expiry
  revokedAt: text('revoked_at'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => ({
  farm: index('idx_invite_farm').on(t.farmId),
}));

// ==================== LAND ====================

export const landParcels = sqliteTable('land_parcels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  landUse: text('land_use').notNull().default('pasture'), // pasture|silage|hay|arable|woodland|yard|other
  tenure: text('tenure').notNull().default('owned'), // owned|rented|licensed|other
  rentAnnual: real('rent_annual'),
  polygon: text('polygon'), // GeoJSON Polygon geometry
  areaHa: real('area_ha'),
  color: text('color'),
  soilType: text('soil_type'),
  capacity: integer('capacity'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  farm: index('idx_parcel_farm').on(t.farmId),
}));

export const structures = sqliteTable('structures', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('barn'), // barn|shed|yard|pen|silo|water|gate|handling|house|store|other
  latitude: real('latitude'),
  longitude: real('longitude'),
  parcelId: integer('parcel_id').references(() => landParcels.id, { onDelete: 'set null' }),
  capacity: integer('capacity'),
  condition: text('condition'), // good|fair|poor
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  farm: index('idx_structure_farm').on(t.farmId),
}));

// ==================== LIVESTOCK ====================

export const animals = sqliteTable('animals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  species: text('species').notNull().default('cattle'), // cattle|sheep|goat|pig|horse|poultry|other
  tagNo: text('tag_no').notNull(),
  managementTag: text('management_tag'),
  name: text('name'),
  sex: text('sex').notNull(), // female|male
  castrated: integer('castrated', { mode: 'boolean' }).notNull().default(false),
  breed: text('breed'),
  colour: text('colour'),
  dob: text('dob'),
  birthYear: integer('birth_year'),
  damId: integer('dam_id').references((): any => animals.id, { onDelete: 'set null' }),
  sireId: integer('sire_id').references((): any => animals.id, { onDelete: 'set null' }),
  sireName: text('sire_name'), // external / AI sire
  size: integer('size'), // frame score 1 (large) … 4 (small)
  parcelId: integer('parcel_id').references(() => landParcels.id, { onDelete: 'set null' }),
  structureId: integer('structure_id').references(() => structures.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('active'), // active|sold|died|culled|missing
  origin: text('origin').notNull().default('born'), // born|purchased
  purchaseDate: text('purchase_date'),
  purchasePrice: real('purchase_price'),
  purchaseSource: text('purchase_source'),
  exitDate: text('exit_date'),
  exitReason: text('exit_reason'),
  salePrice: real('sale_price'),
  saleWeightKg: real('sale_weight_kg'),
  buyer: text('buyer'),
  carcaseWeightKg: real('carcase_weight_kg'),
  carcaseGrade: text('carcase_grade'), // EUROP conformation + fat class, e.g. R4L
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  farmTag: uniqueIndex('ux_animal_farm_tag').on(t.farmId, t.tagNo),
  farmSpecies: index('idx_animal_farm_species').on(t.farmId, t.species, t.status),
  dam: index('idx_animal_dam').on(t.damId),
  sire: index('idx_animal_sire').on(t.sireId),
}));

export const healthRecords = sqliteTable('health_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  animalId: integer('animal_id').notNull().references(() => animals.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  type: text('type').notNull(), // vaccination|treatment|test|procedure|vet_visit|observation|injury
  title: text('title').notNull(),
  product: text('product'),
  dose: text('dose'),
  batchNo: text('batch_no'),
  administeredBy: text('administered_by'),
  vet: text('vet'),
  result: text('result'),
  withdrawalMeatUntil: text('withdrawal_meat_until'),
  withdrawalMilkUntil: text('withdrawal_milk_until'),
  nextDueDate: text('next_due_date'),
  cost: real('cost'),
  notes: text('notes'),
  createdBy: integer('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  farmDate: index('idx_health_farm_date').on(t.farmId, t.date),
  animal: index('idx_health_animal').on(t.animalId),
  due: index('idx_health_due').on(t.farmId, t.nextDueDate),
}));

export const weightRecords = sqliteTable('weight_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  animalId: integer('animal_id').notNull().references(() => animals.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  weightKg: real('weight_kg').notNull(),
  conditionScore: real('condition_score'),
  notes: text('notes'),
  createdBy: integer('created_by'),
  createdAt: createdAt(),
}, (t) => ({
  animal: index('idx_weight_animal').on(t.animalId, t.date),
  farm: index('idx_weight_farm').on(t.farmId),
}));

export const breedingRecords = sqliteTable('breeding_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  animalId: integer('animal_id').notNull().references(() => animals.id, { onDelete: 'cascade' }),
  event: text('event').notNull(), // service|scan|heat
  date: text('date').notNull(),
  method: text('method'), // natural|ai|et (services)
  sireId: integer('sire_id').references(() => animals.id, { onDelete: 'set null' }),
  sireName: text('sire_name'),
  scanResult: text('scan_result'), // pregnant|empty|unknown (scans)
  fetusCount: integer('fetus_count'),
  expectedDueDate: text('expected_due_date'),
  outcome: text('outcome').notNull().default('pending'), // pending|born|failed|aborted
  notes: text('notes'),
  createdBy: integer('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  farm: index('idx_breeding_farm').on(t.farmId, t.date),
  animal: index('idx_breeding_animal').on(t.animalId),
  due: index('idx_breeding_due').on(t.farmId, t.expectedDueDate),
}));

export const birthRecords = sqliteTable('birth_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  damId: integer('dam_id').notNull().references(() => animals.id, { onDelete: 'cascade' }),
  offspringId: integer('offspring_id').references(() => animals.id, { onDelete: 'set null' }),
  date: text('date').notNull(),
  sex: text('sex'), // female|male|null
  sireId: integer('sire_id').references(() => animals.id, { onDelete: 'set null' }),
  sireName: text('sire_name'),
  ease: text('ease'), // unassisted|easy_pull|hard_pull|vet|caesarean
  outcome: text('outcome').notNull().default('alive'), // alive|stillborn|died
  birthWeightKg: real('birth_weight_kg'),
  notes: text('notes'),
  createdBy: integer('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  farm: index('idx_birth_farm').on(t.farmId, t.date),
  dam: index('idx_birth_dam').on(t.damId),
}));

export const movements = sqliteTable('movements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  animalId: integer('animal_id').notNull().references(() => animals.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  fromParcelId: integer('from_parcel_id').references(() => landParcels.id, { onDelete: 'set null' }),
  toParcelId: integer('to_parcel_id').references(() => landParcels.id, { onDelete: 'set null' }),
  toStructureId: integer('to_structure_id').references(() => structures.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdBy: integer('created_by'),
  createdAt: createdAt(),
}, (t) => ({
  animal: index('idx_movement_animal').on(t.animalId, t.date),
  farm: index('idx_movement_farm').on(t.farmId),
}));

// ==================== EQUIPMENT ====================

export const equipment = sqliteTable('equipment', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull().default('tractor'), // tractor|vehicle|trailer|implement|atv|handling|tool|other
  make: text('make'),
  model: text('model'),
  year: integer('year'),
  registration: text('registration'),
  serialNumber: text('serial_number'),
  purchaseDate: text('purchase_date'),
  purchasePrice: real('purchase_price'),
  status: text('status').notNull().default('active'), // active|needs_attention|in_repair|retired|sold
  hours: real('hours'),
  serviceIntervalHours: real('service_interval_hours'),
  serviceIntervalMonths: integer('service_interval_months'),
  lastServiceDate: text('last_service_date'),
  lastServiceHours: real('last_service_hours'),
  motDue: text('mot_due'),
  insuranceDue: text('insurance_due'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  farm: index('idx_equipment_farm').on(t.farmId),
}));

export const equipmentLogs = sqliteTable('equipment_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  equipmentId: integer('equipment_id').notNull().references(() => equipment.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  type: text('type').notNull(), // service|repair|inspection|fuel|hours|note
  hours: real('hours'),
  cost: real('cost'),
  description: text('description'),
  performedBy: text('performed_by'),
  createdBy: integer('created_by'),
  createdAt: createdAt(),
}, (t) => ({
  equipment: index('idx_eqlog_equipment').on(t.equipmentId, t.date),
  farm: index('idx_eqlog_farm').on(t.farmId),
}));

// ==================== PEOPLE & WORK ====================

export const staff = sqliteTable('staff', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  jobTitle: text('job_title'),
  employmentType: text('employment_type').notNull().default('full_time'), // full_time|part_time|seasonal|contractor
  payRate: real('pay_rate'),
  payUnit: text('pay_unit'), // hour|day|week|month|year
  startDate: text('start_date'),
  endDate: text('end_date'),
  emergencyContact: text('emergency_contact'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  farm: index('idx_staff_farm').on(t.farmId),
}));

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: text('due_date'),
  priority: text('priority').notNull().default('normal'), // low|normal|high
  status: text('status').notNull().default('todo'), // todo|in_progress|done
  category: text('category'), // livestock|land|equipment|admin|other
  assigneeUserId: integer('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
  animalId: integer('animal_id').references(() => animals.id, { onDelete: 'set null' }),
  equipmentId: integer('equipment_id').references(() => equipment.id, { onDelete: 'set null' }),
  parcelId: integer('parcel_id').references(() => landParcels.id, { onDelete: 'set null' }),
  completedAt: text('completed_at'),
  completedBy: integer('completed_by'),
  createdBy: integer('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  farm: index('idx_task_farm').on(t.farmId, t.status, t.dueDate),
}));

export const inventoryItems = sqliteTable('inventory_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull().default('feed'), // feed|medicine|vaccine|fertiliser|seed|fuel|bedding|parts|other
  quantity: real('quantity').notNull().default(0),
  unit: text('unit').notNull().default('units'),
  reorderLevel: real('reorder_level'),
  unitCost: real('unit_cost'),
  supplier: text('supplier'),
  location: text('location'),
  batchNo: text('batch_no'),
  expiryDate: text('expiry_date'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  farm: index('idx_inventory_farm').on(t.farmId),
}));

// ==================== MONEY ====================

export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // income|expense
  category: text('category').notNull(),
  amount: real('amount').notNull(), // always positive
  vatAmount: real('vat_amount'),
  date: text('date').notNull(),
  description: text('description'),
  counterparty: text('counterparty'),
  reference: text('reference'),
  animalId: integer('animal_id').references(() => animals.id, { onDelete: 'set null' }),
  equipmentId: integer('equipment_id').references(() => equipment.id, { onDelete: 'set null' }),
  parcelId: integer('parcel_id').references(() => landParcels.id, { onDelete: 'set null' }),
  staffId: integer('staff_id').references(() => staff.id, { onDelete: 'set null' }),
  // Auto-created transactions point back at the record that generated them
  source: text('source'), // animal_sale|animal_purchase|health|equipment_log|null
  sourceId: integer('source_id'),
  createdBy: integer('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  farmDate: index('idx_txn_farm_date').on(t.farmId, t.date),
  source: index('idx_txn_source').on(t.farmId, t.source, t.sourceId),
  animal: index('idx_txn_animal').on(t.animalId),
}));

// ==================== AUDIT ====================

export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(), // created|updated|deleted|...
  entity: text('entity').notNull(),
  entityId: integer('entity_id'),
  summary: text('summary').notNull(),
  createdAt: createdAt(),
}, (t) => ({
  farm: index('idx_activity_farm').on(t.farmId, t.createdAt),
}));

// ==================== INTEGRATIONS ====================

/** Per-farm settings for external services (provider: orkney_mart | scoteid). Secrets are AES-GCM encrypted. */
export const farmIntegrations = sqliteTable('farm_integrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  config: text('config').notNull().default('{}'), // JSON, non-secret
  secret: text('secret'), // encrypted JSON
  status: text('status').notNull().default('active'), // active|error|disabled
  lastSyncAt: text('last_sync_at'),
  lastError: text('last_error'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  farmProvider: uniqueIndex('ux_integration_farm_provider').on(t.farmId, t.provider),
}));

// Public mart data (shared by all farms)
export const martReports = sqliteTable('mart_reports', {
  id: integer('id').primaryKey(), // source event id
  source: text('source').notNull().default('orkney'),
  date: text('date').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  summary: text('summary'),
  contentHash: text('content_hash').notNull(),
  lotCount: integer('lot_count').notNull().default(0),
  fetchedAt: text('fetched_at').notNull(),
}, (t) => ({
  date: index('idx_mart_report_date').on(t.source, t.date),
}));

export const martLots = sqliteTable('mart_lots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reportId: integer('report_id').notNull().references(() => martReports.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  section: text('section').notNull(),
  category: text('category').notNull(),
  species: text('species').notNull(),
  basis: text('basis').notNull(), // kg|head
  sellerKey: text('seller_key').notNull(),
  seller: text('seller').notNull(),
  weightKg: real('weight_kg'),
  price: real('price').notNull(),
  pricePerKg: real('price_per_kg'),
  breedCode: text('breed_code'),
  headCount: integer('head_count').notNull().default(1),
  buyer: text('buyer'),
  top: integer('top', { mode: 'boolean' }).notNull().default(false),
  raw: text('raw').notNull(),
}, (t) => ({
  seller: index('idx_mart_lot_seller').on(t.sellerKey),
  report: index('idx_mart_lot_report').on(t.reportId),
  catDate: index('idx_mart_lot_cat_date').on(t.category, t.date),
}));

export const martAverages = sqliteTable('mart_averages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reportId: integer('report_id').notNull().references(() => martReports.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  label: text('label').notNull(),
  category: text('category').notNull(),
  species: text('species').notNull(),
  unit: text('unit').notNull(), // ppk|gbp
  value: real('value').notNull(),
}, (t) => ({
  catDate: index('idx_mart_avg_cat_date').on(t.category, t.date),
}));

/** A mart lot that looks like it was sold by this farm, awaiting review / imported / dismissed. */
export const martMatches = sqliteTable('mart_matches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  lotId: integer('lot_id').notNull().references(() => martLots.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('new'), // new|imported|dismissed
  animalIds: text('animal_ids'), // JSON array once imported
  decidedBy: integer('decided_by'),
  decidedAt: text('decided_at'),
  createdAt: createdAt(),
}, (t) => ({
  farmLot: uniqueIndex('ux_mart_match_farm_lot').on(t.farmId, t.lotId),
  farmStatus: index('idx_mart_match_farm_status').on(t.farmId, t.status),
}));

/** Snapshot of what ScotEID holds for the farm's holding, refreshed on each sync. */
export const scoteidAnimals = sqliteTable('scoteid_animals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  tag: text('tag').notNull(), // normalised, e.g. UK523801200788
  sex: text('sex'),
  dob: text('dob'),
  breedCode: text('breed_code'),
  damTag: text('dam_tag'),
  sireTag: text('sire_tag'),
  birthCph: text('birth_cph'),
  currentCph: text('current_cph'),
  dateOnMainCph: text('date_on_main_cph'),
  syncedAt: text('synced_at').notNull(),
}, (t) => ({
  farmTag: uniqueIndex('ux_scoteid_animal_farm_tag').on(t.farmId, t.tag),
}));

export const scoteidEvents = sqliteTable('scoteid_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  tag: text('tag').notNull(),
  eventType: integer('event_type').notNull(), // 0 birth, 1 import, 2 on, 3 off, 7 death, …
  date: text('date').notNull(),
  notificationDate: text('notification_date'),
  cph: text('cph'),
  otherCph: text('other_cph'),
  syncedAt: text('synced_at').notNull(),
}, (t) => ({
  uniq: uniqueIndex('ux_scoteid_event').on(t.farmId, t.tag, t.eventType, t.date),
  farmTag: index('idx_scoteid_event_farm_tag').on(t.farmId, t.tag),
}));

// ==================== FEEDBACK ====================

/** Requests from the app's Feedback button. Each becomes a GitHub issue that Claude picks up (see claude-feedback.yml). */
export const feedback = sqliteTable('feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  kind: text('kind').notNull(), // bug | idea | change
  message: text('message').notNull(),
  page: text('page'),
  issueNumber: integer('issue_number'), // null if GitHub was unreachable or not configured
  createdAt: createdAt(),
}, (t) => ({
  farmCreated: index('idx_feedback_farm_created').on(t.farmId, t.createdAt),
}));

export type User = typeof users.$inferSelect;
export type Farm = typeof farms.$inferSelect;
export type Animal = typeof animals.$inferSelect;
export type Equipment = typeof equipment.$inferSelect;
export type MartLot = typeof martLots.$inferSelect;
