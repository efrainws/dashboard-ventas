CREATE TABLE `own_brand_category_brands` (
	`id` int AUTO_INCREMENT NOT NULL,
	`brand_id` varchar(64) NOT NULL,
	`category_id` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `own_brand_category_brands_id` PRIMARY KEY(`id`),
	CONSTRAINT `own_brand_category_brands_brand_id_unique` UNIQUE(`brand_id`)
);
