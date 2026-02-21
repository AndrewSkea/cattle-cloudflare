CREATE TABLE `farm_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`code` text NOT NULL,
	`role` text NOT NULL,
	`max_uses` integer,
	`used_count` integer DEFAULT 0,
	`access_duration` integer,
	`expires_at` text,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `farm_invites_code_unique` ON `farm_invites` (`code`);--> statement-breakpoint
CREATE INDEX `idx_invite_code` ON `farm_invites` (`code`);--> statement-breakpoint
CREATE INDEX `idx_invite_farm` ON `farm_invites` (`farm_id`);--> statement-breakpoint
CREATE TABLE `farm_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP,
	`expires_at` text,
	`removed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_farm_member_farm_user` ON `farm_members` (`farm_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_farm_member_user` ON `farm_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `farms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `farms_slug_unique` ON `farms` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_farm_slug` ON `farms` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`google_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);--> statement-breakpoint
CREATE INDEX `idx_user_google_id` ON `users` (`google_id`);--> statement-breakpoint
CREATE INDEX `idx_user_email` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `calving_events` ADD `farm_id` integer REFERENCES farms(id);--> statement-breakpoint
CREATE INDEX `idx_calving_farm` ON `calving_events` (`farm_id`);--> statement-breakpoint
ALTER TABLE `cattle` ADD `farm_id` integer REFERENCES farms(id);--> statement-breakpoint
CREATE INDEX `idx_cattle_farm` ON `cattle` (`farm_id`);--> statement-breakpoint
ALTER TABLE `field_assignments` ADD `farm_id` integer REFERENCES farms(id);--> statement-breakpoint
CREATE INDEX `idx_assignment_farm` ON `field_assignments` (`farm_id`);--> statement-breakpoint
ALTER TABLE `fields` ADD `farm_id` integer REFERENCES farms(id);--> statement-breakpoint
CREATE INDEX `idx_fields_farm` ON `fields` (`farm_id`);--> statement-breakpoint
ALTER TABLE `health_events` ADD `farm_id` integer REFERENCES farms(id);--> statement-breakpoint
CREATE INDEX `idx_health_farm` ON `health_events` (`farm_id`);--> statement-breakpoint
ALTER TABLE `sale_events` ADD `farm_id` integer REFERENCES farms(id);--> statement-breakpoint
CREATE INDEX `idx_sale_farm` ON `sale_events` (`farm_id`);--> statement-breakpoint
ALTER TABLE `service_events` ADD `farm_id` integer REFERENCES farms(id);--> statement-breakpoint
CREATE INDEX `idx_service_farm` ON `service_events` (`farm_id`);