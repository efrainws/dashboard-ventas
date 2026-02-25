CREATE TABLE `store_monthly_targets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`month` varchar(7) NOT NULL,
	`store_id` varchar(64) NOT NULL,
	`monthly_target_amount` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_monthly_targets_id` PRIMARY KEY(`id`)
);
