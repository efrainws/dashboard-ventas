CREATE TABLE `terms_acceptance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`terms_version_id` int NOT NULL,
	`accepted_at` timestamp NOT NULL DEFAULT (now()),
	`ip` varchar(64),
	CONSTRAINT `terms_acceptance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `terms_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version` varchar(16) NOT NULL,
	`content` text NOT NULL,
	`is_active` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `terms_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `supplier_status` enum('trial_active','trial_expired','subscribed_active','access_requested','suspended');--> statement-breakpoint
ALTER TABLE `users` ADD `activation_date` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `trial_end_date` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `subscription_start_date` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `terms_version_id` int;--> statement-breakpoint
ALTER TABLE `users` ADD `terms_accepted_at` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `terms_accepted_ip` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `approved_by_id` int;--> statement-breakpoint
ALTER TABLE `users` ADD `approved_at` timestamp;