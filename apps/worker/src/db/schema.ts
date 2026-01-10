/**
 * Drizzle ORM Schema for Cattle Management System
 *
 * This schema matches the Python SQLAlchemy models from the Flask application
 * exactly, ensuring zero data loss during migration.
 */

import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

// ==================== CATTLE TABLE ====================

export const cattle = sqliteTable('cattle', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),

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
}));

// ==================== CALVING EVENTS TABLE ====================

export const calvingEvents = sqliteTable('calving_events', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),

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
}));

// ==================== SERVICE EVENTS TABLE ====================

export const serviceEvents = sqliteTable('service_events', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),

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
}));

// ==================== SALE EVENTS TABLE ====================

export const saleEvents = sqliteTable('sale_events', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Relationship (one-to-one with cattle)
  animalId: integer('animal_id').notNull().unique().references(() => cattle.id, { onDelete: 'cascade' }),

  // Event information
  eventDate: text('event_date').notNull(),        // ISO 8601 date string
  eventType: text('event_type'),                  // 'Sold' or 'Died'
  ageMonths: integer('age_months'),

  // Financial data
  weightKg: real('weight_kg'),                    // Weight in kilograms
  salePrice: real('sale_price'),                  // Sale price in £
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
}));

// ==================== HEALTH EVENTS TABLE ====================

export const healthEvents = sqliteTable('health_events', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Relationship
  animalId: integer('animal_id').notNull().references(() => cattle.id, { onDelete: 'cascade' }),

  // Event information
  eventDate: text('event_date').notNull(),        // ISO 8601 date string
  eventType: text('event_type'),                  // Type of health event (feet trimming, vaccination, etc.)
  description: text('description'),

  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  animalIdx: index('idx_health_animal').on(table.animalId),
  dateIdx: index('idx_health_date').on(table.eventDate),
}));

// ==================== RELATIONS ====================

export const cattleRelations = relations(cattle, ({ one, many }) => ({
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
}));

export const calvingEventsRelations = relations(calvingEvents, ({ one, many }) => ({
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
  animal: one(cattle, {
    fields: [saleEvents.animalId],
    references: [cattle.id],
  }),
}));

export const healthEventsRelations = relations(healthEvents, ({ one }) => ({
  animal: one(cattle, {
    fields: [healthEvents.animalId],
    references: [cattle.id],
  }),
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
