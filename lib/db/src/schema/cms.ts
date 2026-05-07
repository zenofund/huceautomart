import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const newsStatusEnum = pgEnum("news_status", ["draft", "published"]);

export const pushTargetEnum = pgEnum("push_target", [
  "all",
  "buyer",
  "seller",
  "inspector",
]);

export const testimonialStatusEnum = pgEnum("testimonial_status", [
  "pending",
  "approved",
  "rejected",
]);

// ─── CMS Banners / Ads ────────────────────────────────────────────────────────

export const cmsBannersTable = pgTable("cms_banners", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  imageUrl: text("image_url").notNull(),
  linkUrl: text("link_url"),
  position: text("position").notNull().default("home_top"),
  isActive: boolean("is_active").notNull().default(true),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCmsBannerSchema = createInsertSchema(cmsBannersTable).omit({ id: true });
export type InsertCmsBanner = z.infer<typeof insertCmsBannerSchema>;
export type CmsBanner = typeof cmsBannersTable.$inferSelect;

// ─── CMS News ─────────────────────────────────────────────────────────────────

export const cmsNewsTable = pgTable("cms_news", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  excerpt: text("excerpt"),
  tags: text("tags").notNull().default(""),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  slug: text("slug").notNull().unique(),
  authorId: integer("author_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  status: newsStatusEnum("status").notNull().default("draft"),
  likesCount: integer("likes_count").notNull().default(0),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCmsNewsSchema = createInsertSchema(cmsNewsTable).omit({ id: true });
export type InsertCmsNews = z.infer<typeof insertCmsNewsSchema>;
export type CmsNews = typeof cmsNewsTable.$inferSelect;

// ─── Push Messages ────────────────────────────────────────────────────────────

export const pushMessagesTable = pgTable("push_messages", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  targetRole: pushTargetEnum("target_role").notNull().default("all"),
  authorId: integer("author_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPushMessageSchema = createInsertSchema(pushMessagesTable).omit({ id: true });
export type InsertPushMessage = z.infer<typeof insertPushMessageSchema>;
export type PushMessage = typeof pushMessagesTable.$inferSelect;

// ─── App Onboarding Slides ──────────────────────────────────────────────────────

export const onboardingSlidesTable = pgTable("onboarding_slides", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  order: integer("order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOnboardingSlideSchema = createInsertSchema(onboardingSlidesTable).omit({ id: true });
export type InsertOnboardingSlide = z.infer<typeof insertOnboardingSlideSchema>;
export type OnboardingSlide = typeof onboardingSlidesTable.$inferSelect;

// ─── Testimonials (App Reviews) ────────────────────────────────────────────────

export const testimonialsTable = pgTable("testimonials", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  rating: integer("rating").notNull(),
  title: text("title").notNull(),
  comment: text("comment").notNull(),
  status: testimonialStatusEnum("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  approvedBy: integer("approved_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTestimonialSchema = createInsertSchema(testimonialsTable).omit({
  id: true,
  status: true,
  adminNote: true,
  approvedBy: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTestimonial = z.infer<typeof insertTestimonialSchema>;
export type Testimonial = typeof testimonialsTable.$inferSelect;
