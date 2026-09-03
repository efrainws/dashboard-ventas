CREATE TABLE `domain_change_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`idempotency_key` varchar(64) NOT NULL,
	`public_url` varchar(512) NOT NULL,
	`sender_email` varchar(320) NOT NULL,
	`subject` varchar(255) NOT NULL,
	`status` enum('sending','sent','partial','failed') NOT NULL DEFAULT 'sending',
	`recipient_count` int NOT NULL DEFAULT 0,
	`sent_count` int NOT NULL DEFAULT 0,
	`failed_count` int NOT NULL DEFAULT 0,
	`created_by_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	CONSTRAINT `domain_change_campaigns_id` PRIMARY KEY(`id`),
	CONSTRAINT `domain_change_campaigns_idempotency_key_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `domain_change_email_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`delivery_key` varchar(96) NOT NULL,
	`campaign_id` int NOT NULL,
	`user_id` int NOT NULL,
	`recipient_email` varchar(320) NOT NULL,
	`status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`error_code` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `domain_change_email_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `domain_change_email_deliveries_delivery_key_unique` UNIQUE(`delivery_key`)
);
