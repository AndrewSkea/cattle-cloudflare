CREATE TABLE `management_tag_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`animal_id` integer NOT NULL,
	`previous_tag` text NOT NULL,
	`new_tag` text,
	`changed_on` text NOT NULL,
	`changed_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`animal_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_mgmt_history_animal` ON `management_tag_history` (`animal_id`);--> statement-breakpoint
CREATE INDEX `idx_mgmt_history_farm` ON `management_tag_history` (`farm_id`);