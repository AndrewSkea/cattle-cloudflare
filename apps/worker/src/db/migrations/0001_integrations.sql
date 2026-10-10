CREATE TABLE `farm_integrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`provider` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`secret` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_sync_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_integration_farm_provider` ON `farm_integrations` (`farm_id`,`provider`);--> statement-breakpoint
CREATE TABLE `mart_averages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` integer NOT NULL,
	`date` text NOT NULL,
	`label` text NOT NULL,
	`category` text NOT NULL,
	`species` text NOT NULL,
	`unit` text NOT NULL,
	`value` real NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `mart_reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_mart_avg_cat_date` ON `mart_averages` (`category`,`date`);--> statement-breakpoint
CREATE TABLE `mart_lots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` integer NOT NULL,
	`date` text NOT NULL,
	`section` text NOT NULL,
	`category` text NOT NULL,
	`species` text NOT NULL,
	`basis` text NOT NULL,
	`seller_key` text NOT NULL,
	`seller` text NOT NULL,
	`weight_kg` real,
	`price` real NOT NULL,
	`price_per_kg` real,
	`breed_code` text,
	`head_count` integer DEFAULT 1 NOT NULL,
	`buyer` text,
	`top` integer DEFAULT false NOT NULL,
	`raw` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `mart_reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_mart_lot_seller` ON `mart_lots` (`seller_key`);--> statement-breakpoint
CREATE INDEX `idx_mart_lot_report` ON `mart_lots` (`report_id`);--> statement-breakpoint
CREATE INDEX `idx_mart_lot_cat_date` ON `mart_lots` (`category`,`date`);--> statement-breakpoint
CREATE TABLE `mart_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`lot_id` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`animal_ids` text,
	`decided_by` integer,
	`decided_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lot_id`) REFERENCES `mart_lots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_mart_match_farm_lot` ON `mart_matches` (`farm_id`,`lot_id`);--> statement-breakpoint
CREATE INDEX `idx_mart_match_farm_status` ON `mart_matches` (`farm_id`,`status`);--> statement-breakpoint
CREATE TABLE `mart_reports` (
	`id` integer PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'orkney' NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`summary` text,
	`content_hash` text NOT NULL,
	`lot_count` integer DEFAULT 0 NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mart_report_date` ON `mart_reports` (`source`,`date`);--> statement-breakpoint
CREATE TABLE `scoteid_animals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`tag` text NOT NULL,
	`sex` text,
	`dob` text,
	`breed_code` text,
	`dam_tag` text,
	`sire_tag` text,
	`birth_cph` text,
	`current_cph` text,
	`date_on_main_cph` text,
	`synced_at` text NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_scoteid_animal_farm_tag` ON `scoteid_animals` (`farm_id`,`tag`);--> statement-breakpoint
CREATE TABLE `scoteid_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`tag` text NOT NULL,
	`event_type` integer NOT NULL,
	`date` text NOT NULL,
	`notification_date` text,
	`cph` text,
	`other_cph` text,
	`synced_at` text NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_scoteid_event` ON `scoteid_events` (`farm_id`,`tag`,`event_type`,`date`);--> statement-breakpoint
CREATE INDEX `idx_scoteid_event_farm_tag` ON `scoteid_events` (`farm_id`,`tag`);--> statement-breakpoint
ALTER TABLE `animals` ADD `carcase_weight_kg` real;--> statement-breakpoint
ALTER TABLE `animals` ADD `carcase_grade` text;--> statement-breakpoint
ALTER TABLE `farms` ADD `herd_mark` text;