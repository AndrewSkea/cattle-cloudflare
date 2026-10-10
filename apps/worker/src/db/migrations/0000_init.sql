CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer,
	`summary` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_activity_farm` ON `activity_log` (`farm_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `animals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`species` text DEFAULT 'cattle' NOT NULL,
	`tag_no` text NOT NULL,
	`management_tag` text,
	`name` text,
	`sex` text NOT NULL,
	`castrated` integer DEFAULT false NOT NULL,
	`breed` text,
	`colour` text,
	`dob` text,
	`birth_year` integer,
	`dam_id` integer,
	`sire_id` integer,
	`sire_name` text,
	`size` integer,
	`parcel_id` integer,
	`structure_id` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`origin` text DEFAULT 'born' NOT NULL,
	`purchase_date` text,
	`purchase_price` real,
	`purchase_source` text,
	`exit_date` text,
	`exit_reason` text,
	`sale_price` real,
	`sale_weight_kg` real,
	`buyer` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dam_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sire_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parcel_id`) REFERENCES `land_parcels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`structure_id`) REFERENCES `structures`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_animal_farm_tag` ON `animals` (`farm_id`,`tag_no`);--> statement-breakpoint
CREATE INDEX `idx_animal_farm_species` ON `animals` (`farm_id`,`species`,`status`);--> statement-breakpoint
CREATE INDEX `idx_animal_dam` ON `animals` (`dam_id`);--> statement-breakpoint
CREATE INDEX `idx_animal_sire` ON `animals` (`sire_id`);--> statement-breakpoint
CREATE TABLE `birth_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`dam_id` integer NOT NULL,
	`offspring_id` integer,
	`date` text NOT NULL,
	`sex` text,
	`sire_id` integer,
	`sire_name` text,
	`ease` text,
	`outcome` text DEFAULT 'alive' NOT NULL,
	`birth_weight_kg` real,
	`notes` text,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dam_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`offspring_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sire_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_birth_farm` ON `birth_records` (`farm_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_birth_dam` ON `birth_records` (`dam_id`);--> statement-breakpoint
CREATE TABLE `breeding_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`animal_id` integer NOT NULL,
	`event` text NOT NULL,
	`date` text NOT NULL,
	`method` text,
	`sire_id` integer,
	`sire_name` text,
	`scan_result` text,
	`fetus_count` integer,
	`expected_due_date` text,
	`outcome` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`animal_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sire_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_breeding_farm` ON `breeding_records` (`farm_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_breeding_animal` ON `breeding_records` (`animal_id`);--> statement-breakpoint
CREATE INDEX `idx_breeding_due` ON `breeding_records` (`farm_id`,`expected_due_date`);--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'tractor' NOT NULL,
	`make` text,
	`model` text,
	`year` integer,
	`registration` text,
	`serial_number` text,
	`purchase_date` text,
	`purchase_price` real,
	`status` text DEFAULT 'active' NOT NULL,
	`hours` real,
	`service_interval_hours` real,
	`service_interval_months` integer,
	`last_service_date` text,
	`last_service_hours` real,
	`mot_due` text,
	`insurance_due` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_equipment_farm` ON `equipment` (`farm_id`);--> statement-breakpoint
CREATE TABLE `equipment_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`equipment_id` integer NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`hours` real,
	`cost` real,
	`description` text,
	`performed_by` text,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_eqlog_equipment` ON `equipment_logs` (`equipment_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_eqlog_farm` ON `equipment_logs` (`farm_id`);--> statement-breakpoint
CREATE TABLE `farm_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`code` text NOT NULL,
	`role` text NOT NULL,
	`email` text,
	`note` text,
	`max_uses` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`access_days` integer,
	`expires_at` text,
	`revoked_at` text,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `farm_invites_code_unique` ON `farm_invites` (`code`);--> statement-breakpoint
CREATE INDEX `idx_invite_farm` ON `farm_invites` (`farm_id`);--> statement-breakpoint
CREATE TABLE `farm_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text,
	`removed_at` text,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_member_farm_user` ON `farm_members` (`farm_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_member_user` ON `farm_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `farms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`holding_number` text,
	`address` text,
	`latitude` real,
	`longitude` real,
	`zoom` integer,
	`boundary` text,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`area_unit` text DEFAULT 'ha' NOT NULL,
	`species` text DEFAULT '["cattle"]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `farms_slug_unique` ON `farms` (`slug`);--> statement-breakpoint
CREATE TABLE `health_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`animal_id` integer NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`product` text,
	`dose` text,
	`batch_no` text,
	`administered_by` text,
	`vet` text,
	`result` text,
	`withdrawal_meat_until` text,
	`withdrawal_milk_until` text,
	`next_due_date` text,
	`cost` real,
	`notes` text,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`animal_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_health_farm_date` ON `health_records` (`farm_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_health_animal` ON `health_records` (`animal_id`);--> statement-breakpoint
CREATE INDEX `idx_health_due` ON `health_records` (`farm_id`,`next_due_date`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'feed' NOT NULL,
	`quantity` real DEFAULT 0 NOT NULL,
	`unit` text DEFAULT 'units' NOT NULL,
	`reorder_level` real,
	`unit_cost` real,
	`supplier` text,
	`location` text,
	`batch_no` text,
	`expiry_date` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_farm` ON `inventory_items` (`farm_id`);--> statement-breakpoint
CREATE TABLE `land_parcels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`name` text NOT NULL,
	`land_use` text DEFAULT 'pasture' NOT NULL,
	`tenure` text DEFAULT 'owned' NOT NULL,
	`rent_annual` real,
	`polygon` text,
	`area_ha` real,
	`color` text,
	`soil_type` text,
	`capacity` integer,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_parcel_farm` ON `land_parcels` (`farm_id`);--> statement-breakpoint
CREATE TABLE `movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`animal_id` integer NOT NULL,
	`date` text NOT NULL,
	`from_parcel_id` integer,
	`to_parcel_id` integer,
	`to_structure_id` integer,
	`notes` text,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`animal_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_parcel_id`) REFERENCES `land_parcels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`to_parcel_id`) REFERENCES `land_parcels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`to_structure_id`) REFERENCES `structures`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_movement_animal` ON `movements` (`animal_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_movement_farm` ON `movements` (`farm_id`);--> statement-breakpoint
CREATE TABLE `staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`user_id` integer,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`job_title` text,
	`employment_type` text DEFAULT 'full_time' NOT NULL,
	`pay_rate` real,
	`pay_unit` text,
	`start_date` text,
	`end_date` text,
	`emergency_contact` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_staff_farm` ON `staff` (`farm_id`);--> statement-breakpoint
CREATE TABLE `structures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'barn' NOT NULL,
	`latitude` real,
	`longitude` real,
	`parcel_id` integer,
	`capacity` integer,
	`condition` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parcel_id`) REFERENCES `land_parcels`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_structure_farm` ON `structures` (`farm_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`due_date` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`category` text,
	`assignee_user_id` integer,
	`animal_id` integer,
	`equipment_id` integer,
	`parcel_id` integer,
	`completed_at` text,
	`completed_by` integer,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`animal_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parcel_id`) REFERENCES `land_parcels`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_task_farm` ON `tasks` (`farm_id`,`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`amount` real NOT NULL,
	`vat_amount` real,
	`date` text NOT NULL,
	`description` text,
	`counterparty` text,
	`reference` text,
	`animal_id` integer,
	`equipment_id` integer,
	`parcel_id` integer,
	`staff_id` integer,
	`source` text,
	`source_id` integer,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`animal_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parcel_id`) REFERENCES `land_parcels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_txn_farm_date` ON `transactions` (`farm_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_txn_source` ON `transactions` (`farm_id`,`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_txn_animal` ON `transactions` (`animal_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`google_id` text,
	`email` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`phone` text,
	`last_farm_id` integer,
	`last_login_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `weight_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`animal_id` integer NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real NOT NULL,
	`condition_score` real,
	`notes` text,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`animal_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_weight_animal` ON `weight_records` (`animal_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_weight_farm` ON `weight_records` (`farm_id`);