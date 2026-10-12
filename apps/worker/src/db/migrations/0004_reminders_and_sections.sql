CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`farm_id` integer NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`label` text,
	`last_sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_user` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
ALTER TABLE `farms` ADD `hidden_sections` text DEFAULT '[]' NOT NULL;