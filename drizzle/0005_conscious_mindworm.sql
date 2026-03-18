CREATE TABLE `activation_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(128) NOT NULL,
	`user_id` int NOT NULL,
	`username` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activation_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `activation_tokens_token_unique` UNIQUE(`token`)
);
