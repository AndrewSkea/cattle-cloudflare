CREATE TABLE `field_crops` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`parcel_id` integer NOT NULL,
	`crop` text NOT NULL,
	`variety` text,
	`purpose` text DEFAULT 'grazing' NOT NULL,
	`status` text DEFAULT 'growing' NOT NULL,
	`start_date` text,
	`expected_harvest` text,
	`end_date` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parcel_id`) REFERENCES `land_parcels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_crop_parcel` ON `field_crops` (`parcel_id`,`start_date`);--> statement-breakpoint
CREATE INDEX `idx_crop_farm` ON `field_crops` (`farm_id`);--> statement-breakpoint
CREATE TABLE `field_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`parcel_id` integer NOT NULL,
	`crop_id` integer,
	`type` text NOT NULL,
	`status` text DEFAULT 'done' NOT NULL,
	`date` text NOT NULL,
	`end_date` text,
	`product` text,
	`rate` real,
	`rate_unit` text,
	`area_ha` real,
	`n_kg_ha` real,
	`p_kg_ha` real,
	`k_kg_ha` real,
	`s_kg_ha` real,
	`yield_amount` real,
	`yield_unit` text,
	`moisture_pct` real,
	`dry_matter_pct` real,
	`no_graze_until` text,
	`cost` real,
	`contractor` text,
	`equipment_id` integer,
	`notes` text,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parcel_id`) REFERENCES `land_parcels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`crop_id`) REFERENCES `field_crops`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_fevent_parcel` ON `field_events` (`parcel_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_fevent_farm` ON `field_events` (`farm_id`,`date`);--> statement-breakpoint
CREATE TABLE `field_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`parcel_id` integer NOT NULL,
	`event_id` integer NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`value` real NOT NULL,
	`unit` text,
	`latitude` real,
	`longitude` real,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parcel_id`) REFERENCES `land_parcels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `field_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_freading_parcel` ON `field_readings` (`parcel_id`,`kind`,`date`);--> statement-breakpoint
CREATE INDEX `idx_freading_event` ON `field_readings` (`event_id`);