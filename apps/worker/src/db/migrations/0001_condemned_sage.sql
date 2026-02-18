CREATE TABLE `field_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cattle_id` integer NOT NULL,
	`field_id` integer NOT NULL,
	`assigned_date` text NOT NULL,
	`removed_date` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`cattle_id`) REFERENCES `cattle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`field_id`) REFERENCES `fields`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_assignment_cattle` ON `field_assignments` (`cattle_id`);--> statement-breakpoint
CREATE INDEX `idx_assignment_field` ON `field_assignments` (`field_id`);--> statement-breakpoint
CREATE TABLE `fields` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`field_type` text DEFAULT 'grazing',
	`polygon` text,
	`center_lat` real,
	`center_lng` real,
	`area` real,
	`capacity` integer,
	`color` text DEFAULT '#22c55e',
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE `health_events` ADD `numeric_value` real;