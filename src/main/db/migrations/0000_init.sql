CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer,
	`message` text NOT NULL,
	`link` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`task` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`images` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`content_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_settings_key_unique` ON `app_settings` (`key`);--> statement-breakpoint
CREATE TABLE `calendar_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`month` text NOT NULL,
	`focus` text,
	`item_type` text DEFAULT 'supporting' NOT NULL,
	`title` text NOT NULL,
	`keyword` text,
	`why` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`content_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`type` text DEFAULT 'blog post' NOT NULL,
	`status` text DEFAULT 'Idea' NOT NULL,
	`mode` text DEFAULT 'A' NOT NULL,
	`topic` text,
	`notes` text,
	`title` text,
	`slug` text,
	`focus_keyword` text,
	`secondary_keywords_json` text,
	`seo_title` text,
	`meta_description` text,
	`excerpt` text,
	`categories_json` text,
	`tags_json` text,
	`body_html` text,
	`schema_json` text,
	`seo_score` integer,
	`checks_json` text,
	`research_json` text,
	`brief_json` text,
	`facts_json` text,
	`target_words` integer,
	`cluster_id` text,
	`is_pillar` integer DEFAULT false NOT NULL,
	`refresh_of_url` text,
	`refresh_of_wp_id` integer,
	`model_overrides_json` text,
	`review_checklist_json` text,
	`wp_post_id` integer,
	`wp_post_type` text,
	`wp_edit_url` text,
	`live_url` text,
	`published_at` integer,
	`index_status` text,
	`index_checked_at` integer,
	`calendar_item_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_site_idx` ON `content` (`site_id`);--> statement-breakpoint
CREATE TABLE `content_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_id` integer NOT NULL,
	`body_html` text,
	`meta_json` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`content_id` integer,
	`slot` text,
	`file_path` text NOT NULL,
	`fallback_path` text,
	`filename` text NOT NULL,
	`alt` text,
	`title` text,
	`caption` text,
	`description` text,
	`prompt` text,
	`model_id` text,
	`width` integer,
	`height` integer,
	`wp_media_id` integer,
	`wp_url` text,
	`ai_generated` integer DEFAULT false NOT NULL,
	`selected` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer,
	`content_id` integer,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`step` text,
	`progress` text,
	`input_json` text,
	`output_json` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `keywords` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`keyword` text NOT NULL,
	`group_name` text,
	`target_page_url` text,
	`location` text,
	`device` text,
	`source` text DEFAULT 'Manual' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `models` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`label` text NOT NULL,
	`capabilities_json` text NOT NULL,
	`capability_overrides_json` text,
	`context_window` integer,
	`prices_json` text,
	`price_edited` integer DEFAULT false NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `models_provider_idx` ON `models` (`provider_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`read` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`meta_description` text,
	`h1` text,
	`headings_json` text,
	`word_count` integer,
	`internal_links_json` text,
	`paragraphs_json` text,
	`canonical` text,
	`status_code` integer,
	`wp_id` integer,
	`wp_type` text,
	`focus_keyword` text,
	`source` text DEFAULT 'crawl' NOT NULL,
	`last_crawled_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pages_site_idx` ON `pages` (`site_id`);--> statement-breakpoint
CREATE TABLE `prompt_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`body` text NOT NULL,
	`is_custom` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_templates_key_unique` ON `prompt_templates` (`key`);--> statement-breakpoint
CREATE TABLE `provider_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`display_name` text NOT NULL,
	`auth_kind` text NOT NULL,
	`base_url` text,
	`extra_json` text,
	`secret_ref` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`status_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_connections_provider_id_unique` ON `provider_connections` (`provider_id`);--> statement-breakpoint
CREATE TABLE `rank_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`keyword_id` integer NOT NULL,
	`date` text NOT NULL,
	`position` real,
	`clicks` integer,
	`impressions` integer,
	`ctr` real,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rank_kw_idx` ON `rank_history` (`keyword_id`,`date`);--> statement-breakpoint
CREATE TABLE `sites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`language` text DEFAULT 'English' NOT NULL,
	`country` text DEFAULT 'US' NOT NULL,
	`business_profile_json` text,
	`strategy_notes` text,
	`voice_samples_json` text,
	`image_style_json` text,
	`export_format` text DEFAULT 'generic' NOT NULL,
	`settings_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_models` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer,
	`task` text NOT NULL,
	`provider_id` text,
	`model_id` text,
	`fallback_provider_id` text,
	`fallback_model_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
