/**
 * Drizzle ORM Schema for Cattle Management System
 *
 * This schema matches the Python SQLAlchemy models from the Flask application
 * exactly, ensuring zero data loss during migration.
 */

import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

// ==================== USERS TABLE ====================

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  googleId: text('google_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  googleIdIdx: index('idx_user_google_id').on(table.googleId),
  emailIdx: index('idx_user_email').on(table.email),
}));

// ==================== FARMS TABLE ====================

export const farms = sqliteTable('farms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  slugIdx: index('idx_farm_slug').on(table.slug),
}));

// ==================== FARM MEMBERS TABLE ====================

export const farmMembers = sqliteTable('farm_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'owner' | 'manager' | 'worker' | 'viewer'
  joinedAt: text('joined_at').default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text('expires_at'), // null = permanent
  removedAt: text('removed_at'), // null = active
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  farmUserIdx: index('idx_farm_member_farm_user').on(table.farmId, table.userId),
  userIdx: index('idx_farm_member_user').on(table.userId),
}));

// ==================== FARM INVITES TABLE ====================

export const farmInvites = sqliteTable('farm_invites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  role: text('role').notNull(),
  maxUses: integer('max_uses'), // null = unlimited
  usedCount: integer('used_count').default(0),
  accessDuration: integer('access_duration'), // null = permanent, otherwise days
  expiresAt: text('expires_at'), // null = never (link expiry)
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  codeIdx: index('idx_invite_code').on(table.code),
  farmIdx: index('idx_invite_farm').on(table.farmId),
}));

// ==================== CATTLE TABLE ====================

export const cattle = sqliteTable('cattle', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Farm ownership
  farmId: integer('farm_id').references(() => farms.id, { onDelete: 'cascade' }),

  // Identification fields
  tagNo: text('tag_no').notNull().unique(),      // UK EID tag (unique identifier)
  managementTag: text('management_tag'),          // User-friendly management number
  yob: integer('yob').notNull(),                  // Year of birth
  dob: text('dob').notNull(),                     // Date of birth (ISO 8601 string)

  // Physical attributes
  breed: text('breed'),                           // Breed code (Char, AA, Lim, Simm, Luing)
  sex: text('sex'),                               // Sex (fem, male, steer, hief, fem-clf)
  size: integer('size'),                          // Size classification (1=large, 4=small)

  // Parent relationships (self-referencing for maternal lineage)
  damTag: integer('dam_tag').references((): any => cattle.id),  // Foreign key to mother

  // Current status
  onFarm: integer('on_farm', { mode: 'boolean' }).default(true),
  currentStatus: text('current_status'),          // Active, Sold, Died, etc.

  // Notes
  notes: text('notes'),

  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  // Indexes for performance (matching Python model)
  tagNoIdx: index('idx_tag_no').on(table.tagNo),
  managementTagIdx: index('idx_management_tag').on(table.managementTag),
  damTagIdx: index('idx_dam_tag').on(table.damTag),  // Critical for lineage queries
  farmIdx: index('idx_cattle_farm').on(table.farmId),
}));

// ==================== CALVING EVENTS TABLE ====================

export const calvingEvents = sqliteTable('calving_events', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Farm ownership
  farmId: integer('farm_id').references(() => farms.id, { onDelete: 'cascade' }),

  // Relationships
  motherId: integer('mother_id').notNull().references(() => cattle.id, { onDelete: 'cascade' }),
  calfId: integer('calf_id').references(() => cattle.id),

  // Calving information
  calvingDate: text('calving_date').notNull(),    // ISO 8601 date string
  calvingYear: integer('calving_year').notNull(),
  calvingMonth: text('calving_month'),            // Month name
  calfSex: text('calf_sex'),                      // Sex of calf
  sire: text('sire'),                             // Bull breed
  daysSinceLastCalving: integer('days_since_last_calving'),  // Calving interval

  // Notes
  notes: text('notes'),

  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  motherIdx: index('idx_calving_mother').on(table.motherId),
  dateIdx: index('idx_calving_date').on(table.calvingDate),
  farmIdx: index('idx_calving_farm').on(table.farmId),
}));

// ==================== SERVICE EVENTS TABLE ====================

export const serviceEvents = sqliteTable('service_events', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Farm ownership
  farmId: integer('farm_id').references(() => farms.id, { onDelete: 'cascade' }),

  // Relationships
  cowId: integer('cow_id').notNull().references(() => cattle.id, { onDelete: 'cascade' }),

  // Service information
  serviceDate: text('service_date').notNull(),    // ISO 8601 date string
  sire: text('sire'),                             // Bull breed

  // Expected calving
  expectedCalvingDate: text('expected_calving_date'),  // Service date + 283 days
  expectedCalvingPeriod: text('expected_calving_period'),

  // Link to actual calving event (once calf is born)
  calvingEventId: integer('calving_event_id').references(() => calvingEvents.id),
  successful: integer('successful', { mode: 'boolean' }),

  // Notes
  notes: text('notes'),

  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  cowIdx: index('idx_service_cow').on(table.cowId),
  dateIdx: index('idx_service_date').on(table.serviceDate),
  expectedDateIdx: index('idx_expected_calving').on(table.expectedCalvingDate),
  farmIdx: index('idx_service_farm').on(table.farmId),
}));

// ==================== SALE EVENTS TABLE ====================

export const saleEvents = sqliteTable('sale_events', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Farm ownership
  farmId: integer('farm_id').references(() => farms.id, { onDelete: 'cascade' }),

  // Relationship (one-to-one with cattle)
  animalId: integer('animal_id').notNull().unique().references(() => cattle.id, { onDelete: 'cascade' }),

  // Event information
  eventDate: text('event_date').notNull(),        // ISO 8601 date string
  eventType: text('event_type'),                  // 'Sold' or 'Died'
  ageMonths: integer('age_months'),

  // Financial data
  weightKg: real('weight_kg'),                    // Weight in kilograms
  salePrice: real('sale_price'),                  // Sale price in GBP
  kgPerMonth: real('kg_per_month'),               // Growth rate (weight / age)
  pricePerMonth: real('price_per_month'),         // Return rate (price / age)

  // Notes
  notes: text('notes'),

  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  animalIdx: index('idx_sale_animal').on(table.animalId),
  dateIdx: index('idx_sale_date').on(table.eventDate),
  farmIdx: index('idx_sale_farm').on(table.farmId),
}));

// ==================== HEALTH EVENTS TABLE ====================

export const healthEvents = sqliteTable('health_events', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Farm ownership
  farmId: integer('farm_id').references(() => farms.id, { onDelete: 'cascade' }),

  // Relationship
  animalId: integer('animal_id').notNull().references(() => cattle.id, { onDelete: 'cascade' }),

  // Event information
  eventDate: text('event_date').notNull(),        // ISO 8601 date string
  eventType: text('event_type'),                  // Type of health event (feet trimming, vaccination, etc.)
  description: text('description'),
  numericValue: real('numeric_value'),  // For weight, temperature, etc.

  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  animalIdx: index('idx_health_animal').on(table.animalId),
  dateIdx: index('idx_health_date').on(table.eventDate),
  farmIdx: index('idx_health_farm').on(table.farmId),
}));

// ==================== FIELDS TABLE ====================

export const fields = sqliteTable('fields', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').references(() => farms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  fieldType: text('field_type').default('grazing'), // grazing/silage/hay/housing
  polygon: text('polygon'), // GeoJSON string of polygon coordinates
  centerLat: real('center_lat'),
  centerLng: real('center_lng'),
  area: real('area'), // hectares
  capacity: integer('capacity'),
  color: text('color').default('#22c55e'),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  farmIdx: index('idx_fields_farm').on(table.farmId),
}));

// ==================== FIELD ASSIGNMENTS TABLE ====================

export const fieldAssignments = sqliteTable('field_assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').references(() => farms.id, { onDelete: 'cascade' }),
  cattleId: integer('cattle_id').notNull().references(() => cattle.id, { onDelete: 'cascade' }),
  fieldId: integer('field_id').notNull().references(() => fields.id, { onDelete: 'cascade' }),
  assignedDate: text('assigned_date').notNull(),
  removedDate: text('removed_date'), // null = currently in field
  notes: text('notes'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  cattleIdx: index('idx_assignment_cattle').on(table.cattleId),
  fieldIdx: index('idx_assignment_field').on(table.fieldId),
  farmIdx: index('idx_assignment_farm').on(table.farmId),
}));

// ==================== RELATIONS ====================

export const usersRelations = relations(users, ({ many }) => ({
  farmMemberships: many(farmMembers),
}));

export const farmsRelations = relations(farms, ({ many }) => ({
  members: many(farmMembers),
  invites: many(farmInvites),
  cattle: many(cattle),
}));

export const farmMembersRelations = relations(farmMembers, ({ one }) => ({
  farm: one(farms, { fields: [farmMembers.farmId], references: [farms.id] }),
  user: one(users, { fields: [farmMembers.userId], references: [users.id] }),
}));

export const farmInvitesRelations = relations(farmInvites, ({ one }) => ({
  farm: one(farms, { fields: [farmInvites.farmId], references: [farms.id] }),
  createdByUser: one(users, { fields: [farmInvites.createdBy], references: [users.id] }),
}));

export const cattleRelations = relations(cattle, ({ one, many }) => ({
  // Farm ownership
  farm: one(farms, { fields: [cattle.farmId], references: [farms.id] }),

  // Self-referencing maternal relationship
  dam: one(cattle, {
    fields: [cattle.damTag],
    references: [cattle.id],
    relationName: 'maternal',
  }),
  offspring: many(cattle, {
    relationName: 'maternal',
  }),

  // Event relationships
  calvings: many(calvingEvents, {
    relationName: 'motherCalvings',
  }),
  services: many(serviceEvents),
  sale: one(saleEvents),
  healthEvents: many(healthEvents),
  fieldAssignments: many(fieldAssignments),
}));

export const calvingEventsRelations = relations(calvingEvents, ({ one, many }) => ({
  farm: one(farms, { fields: [calvingEvents.farmId], references: [farms.id] }),
  mother: one(cattle, {
    fields: [calvingEvents.motherId],
    references: [cattle.id],
    relationName: 'motherCalvings',
  }),
  calf: one(cattle, {
    fields: [calvingEvents.calfId],
    references: [cattle.id],
  }),
  services: many(serviceEvents),
}));

export const serviceEventsRelations = relations(serviceEvents, ({ one }) => ({
  farm: one(farms, { fields: [serviceEvents.farmId], references: [farms.id] }),
  cow: one(cattle, {
    fields: [serviceEvents.cowId],
    references: [cattle.id],
  }),
  calvingEvent: one(calvingEvents, {
    fields: [serviceEvents.calvingEventId],
    references: [calvingEvents.id],
  }),
}));

export const saleEventsRelations = relations(saleEvents, ({ one }) => ({
  farm: one(farms, { fields: [saleEvents.farmId], references: [farms.id] }),
  animal: one(cattle, {
    fields: [saleEvents.animalId],
    references: [cattle.id],
  }),
}));

export const healthEventsRelations = relations(healthEvents, ({ one }) => ({
  farm: one(farms, { fields: [healthEvents.farmId], references: [farms.id] }),
  animal: one(cattle, {
    fields: [healthEvents.animalId],
    references: [cattle.id],
  }),
}));

export const fieldsRelations = relations(fields, ({ one, many }) => ({
  farm: one(farms, { fields: [fields.farmId], references: [farms.id] }),
  assignments: many(fieldAssignments),
}));

export const fieldAssignmentsRelations = relations(fieldAssignments, ({ one }) => ({
  farm: one(farms, { fields: [fieldAssignments.farmId], references: [farms.id] }),
  cattle: one(cattle, { fields: [fieldAssignments.cattleId], references: [cattle.id] }),
  field: one(fields, { fields: [fieldAssignments.fieldId], references: [fields.id] }),
}));

// ==================== TYPE EXPORTS ====================

export type Cattle = typeof cattle.$inferSelect;
export type NewCattle = typeof cattle.$inferInsert;

export type CalvingEvent = typeof calvingEvents.$inferSelect;
export type NewCalvingEvent = typeof calvingEvents.$inferInsert;

export type ServiceEvent = typeof serviceEvents.$inferSelect;
export type NewServiceEvent = typeof serviceEvents.$inferInsert;

export type SaleEvent = typeof saleEvents.$inferSelect;
export type NewSaleEvent = typeof saleEvents.$inferInsert;

export type HealthEvent = typeof healthEvents.$inferSelect;
export type NewHealthEvent = typeof healthEvents.$inferInsert;

export type Field = typeof fields.$inferSelect;
export type NewField = typeof fields.$inferInsert;

export type FieldAssignment = typeof fieldAssignments.$inferSelect;
export type NewFieldAssignment = typeof fieldAssignments.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Farm = typeof farms.$inferSelect;
export type NewFarm = typeof farms.$inferInsert;

export type FarmMember = typeof farmMembers.$inferSelect;
export type NewFarmMember = typeof farmMembers.$inferInsert;

export type FarmInvite = typeof farmInvites.$inferSelect;
export type NewFarmInvite = typeof farmInvites.$inferInsert;
