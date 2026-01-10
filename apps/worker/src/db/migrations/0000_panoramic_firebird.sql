CREATE TABLE `calving_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mother_id` integer NOT NULL,
	`calf_id` integer,
	`calving_date` text NOT NULL,
	`calving_year` integer NOT NULL,
	`calving_month` text,
	`calf_sex` text,
	`sire` text,
	`days_since_last_calving` integer,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`mother_id`) REFERENCES `cattle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`calf_id`) REFERENCES `cattle`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_calving_mother` ON `calving_events` (`mother_id`);--> statement-breakpoint
CREATE INDEX `idx_calving_date` ON `calving_events` (`calving_date`);--> statement-breakpoint
CREATE TABLE `cattle` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tag_no` text NOT NULL,
	`management_tag` text,
	`yob` integer NOT NULL,
	`dob` text NOT NULL,
	`breed` text,
	`sex` text,
	`size` integer,
	`dam_tag` integer,
	`on_farm` integer DEFAULT true,
	`current_status` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`dam_tag`) REFERENCES `cattle`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cattle_tag_no_unique` ON `cattle` (`tag_no`);--> statement-breakpoint
CREATE INDEX `idx_tag_no` ON `cattle` (`tag_no`);--> statement-breakpoint
CREATE INDEX `idx_management_tag` ON `cattle` (`management_tag`);--> statement-breakpoint
CREATE INDEX `idx_dam_tag` ON `cattle` (`dam_tag`);--> statement-breakpoint
CREATE TABLE `health_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`animal_id` integer NOT NULL,
	`event_date` text NOT NULL,
	`event_type` text,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`animal_id`) REFERENCES `cattle`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_health_animal` ON `health_events` (`animal_id`);--> statement-breakpoint
CREATE INDEX `idx_health_date` ON `health_events` (`event_date`);--> statement-breakpoint
CREATE TABLE `sale_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`animal_id` integer NOT NULL,
	`event_date` text NOT NULL,
	`event_type` text,
	`age_months` integer,
	`weight_kg` real,
	`sale_price` real,
	`kg_per_month` real,
	`price_per_month` real,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`animal_id`) REFERENCES `cattle`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sale_events_animal_id_unique` ON `sale_events` (`animal_id`);--> statement-breakpoint
CREATE INDEX `idx_sale_animal` ON `sale_events` (`animal_id`);--> statement-breakpoint
CREATE INDEX `idx_sale_date` ON `sale_events` (`event_date`);--> statement-breakpoint
CREATE TABLE `service_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cow_id` integer NOT NULL,
	`service_date` text NOT NULL,
	`sire` text,
	`expected_calving_date` text,
	`expected_calving_period` text,
	`calving_event_id` integer,
	`successful` integer,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`cow_id`) REFERENCES `cattle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`calving_event_id`) REFERENCES `calving_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_service_cow` ON `service_events` (`cow_id`);--> statement-breakpoint
CREATE INDEX `idx_service_date` ON `service_events` (`service_date`);--> statement-breakpoint
CREATE INDEX `idx_expected_calving` ON `service_events` (`expected_calving_date`);