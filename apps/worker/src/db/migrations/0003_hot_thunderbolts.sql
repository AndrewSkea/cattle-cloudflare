CREATE TABLE `machinery` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`make` text,
	`model` text,
	`year` integer,
	`purchase_date` text,
	`purchase_price` real,
	`serial_number` text,
	`status` text DEFAULT 'active',
	`sold_date` text,
	`sale_price` real,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_machinery_farm` ON `machinery` (`farm_id`);--> statement-breakpoint
CREATE TABLE `machinery_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`machinery_id` integer NOT NULL,
	`field_id` integer,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`cost` real,
	`description` text,
	`hours_or_mileage` real,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`machinery_id`) REFERENCES `machinery`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`field_id`) REFERENCES `fields`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_machinery_events_farm` ON `machinery_events` (`farm_id`);--> statement-breakpoint
CREATE INDEX `idx_machinery_events_machinery` ON `machinery_events` (`machinery_id`);--> statement-breakpoint
CREATE INDEX `idx_machinery_events_field` ON `machinery_events` (`field_id`);--> statement-breakpoint
CREATE TABLE `payroll_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`worker_id` integer NOT NULL,
	`date` text NOT NULL,
	`amount` real NOT NULL,
	`type` text NOT NULL,
	`period_start` text,
	`period_end` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_payroll_farm` ON `payroll_events` (`farm_id`);--> statement-breakpoint
CREATE INDEX `idx_payroll_worker` ON `payroll_events` (`worker_id`);--> statement-breakpoint
CREATE TABLE `supply_purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`field_id` integer,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`quantity` real,
	`unit` text,
	`unit_cost` real,
	`total_cost` real NOT NULL,
	`supplier` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`field_id`) REFERENCES `fields`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_supplies_farm` ON `supply_purchases` (`farm_id`);--> statement-breakpoint
CREATE INDEX `idx_supplies_field` ON `supply_purchases` (`field_id`);--> statement-breakpoint
CREATE INDEX `idx_supplies_category` ON `supply_purchases` (`category`);--> statement-breakpoint
CREATE TABLE `workers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`start_date` text,
	`end_date` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workers_farm` ON `workers` (`farm_id`);