CREATE TABLE `own_brand_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`color` varchar(16) DEFAULT '#008064',
	`is_active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `own_brand_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `own_brand_categories_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `own_brand_product_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`article_id` varchar(64) NOT NULL,
	`category_id` int NOT NULL,
	`article_name` varchar(255),
	`article_code` varchar(64),
	`assigned_by_id` int NOT NULL,
	`assigned_by_name` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `own_brand_product_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `own_brand_product_categories_article_id_unique` UNIQUE(`article_id`)
);
