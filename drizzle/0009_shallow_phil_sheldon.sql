CREATE TABLE `own_brand_brands` (
	`id` int AUTO_INCREMENT NOT NULL,
	`brand_id` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `own_brand_brands_id` PRIMARY KEY(`id`),
	CONSTRAINT `own_brand_brands_brand_id_unique` UNIQUE(`brand_id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('system_specialist','cst_user','commercial_specialist','store_user','supplier_user','own_brand_user') NOT NULL DEFAULT 'cst_user';