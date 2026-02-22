CREATE TABLE `allocation_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_id` integer,
	`group_type` text NOT NULL,
	`group_target` integer,
	`animal_count` integer NOT NULL,
	`total_amount` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_alloc_group_farm` ON `allocation_groups` (`farm_id`);--> statement-breakpoint
CREATE TABLE `cost_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_id` integer,
	`cattle_id` integer NOT NULL,
	`amount` real NOT NULL,
	`date` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cattle_id`) REFERENCES `cattle`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cost_alloc_farm` ON `cost_allocations` (`farm_id`);--> statement-breakpoint
CREATE INDEX `idx_cost_alloc_cattle` ON `cost_allocations` (`cattle_id`);--> statement-breakpoint
CREATE INDEX `idx_cost_alloc_source` ON `cost_allocations` (`source_type`,`source_id`);