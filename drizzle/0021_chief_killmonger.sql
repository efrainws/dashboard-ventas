CREATE TABLE `supplier_trial_alert_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`delivery_key` varchar(96) NOT NULL,
	`schedule_cron_task_uid` varchar(65) NOT NULL,
	`user_id` int NOT NULL,
	`recipient_email` varchar(320) NOT NULL,
	`trial_end_date` timestamp NOT NULL,
	`status` enum('sending','sent','failed') NOT NULL,
	`error_code` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`sent_at` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_trial_alert_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplier_trial_alert_deliveries_delivery_key_unique` UNIQUE(`delivery_key`)
);
--> statement-breakpoint
CREATE TABLE `supplier_trial_alert_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schedule_cron_task_uid` varchar(65) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_trial_alert_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplier_trial_alert_schedules_schedule_cron_task_uid_unique` UNIQUE(`schedule_cron_task_uid`)
);
