CREATE TABLE `shelf_zones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sap_id` varchar(16) NOT NULL,
	`shelf_id` varchar(64),
	`shelf_name` varchar(256),
	`x` decimal(10,2) NOT NULL,
	`y` decimal(10,2) NOT NULL,
	`width` decimal(10,2) NOT NULL,
	`height` decimal(10,2) NOT NULL,
	`rotation` decimal(6,2) DEFAULT '0',
	`fill_color` varchar(16),
	`created_by` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shelf_zones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `store_layouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sap_id` varchar(16) NOT NULL,
	`branch_name` varchar(128) NOT NULL,
	`image_url` text NOT NULL,
	`image_key` varchar(512) NOT NULL,
	`mime_type` varchar(64) NOT NULL,
	`uploaded_by` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_layouts_id` PRIMARY KEY(`id`),
	CONSTRAINT `store_layouts_sap_id_unique` UNIQUE(`sap_id`)
);
