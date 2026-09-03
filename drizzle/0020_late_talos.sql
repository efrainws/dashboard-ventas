ALTER TABLE `domain_change_campaigns` MODIFY COLUMN `status` enum('draft','tested','sending','sent','partial','failed') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `domain_change_campaigns` ADD `tested_by_id` int;--> statement-breakpoint
ALTER TABLE `domain_change_campaigns` ADD `test_recipient_email` varchar(320);--> statement-breakpoint
ALTER TABLE `domain_change_campaigns` ADD `tested_at` timestamp;