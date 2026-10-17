CREATE TABLE `monthly_prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`species` text DEFAULT 'cattle' NOT NULL,
	`month` text NOT NULL,
	`ppk` real NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_monthly_price` ON `monthly_prices` (`farm_id`,`species`,`month`);--> statement-breakpoint
CREATE TABLE `sale_statements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` integer NOT NULL,
	`mart` text DEFAULT 'Orkney Auction Mart' NOT NULL,
	`sale_ref` text,
	`title` text,
	`date` text NOT NULL,
	`file_name` text,
	`head_count` integer NOT NULL,
	`gross` real NOT NULL,
	`commission` real,
	`insurance` real,
	`vat` real,
	`other_charges` real,
	`net` real,
	`lots` text NOT NULL,
	`animal_ids` text NOT NULL,
	`match_ids` text,
	`status` text DEFAULT 'imported' NOT NULL,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sale_statement_farm_date` ON `sale_statements` (`farm_id`,`date`);