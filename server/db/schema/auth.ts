// `04-database-schema.md` §8 — the four tables this project does not own.
//
// ⚠️ GENERATED. Do not hand-edit. Nothing is remapped — no `modelName`, no
// `fields`, no `additionalFields` (`08` §7) — precisely so this file can be
// regenerated and diffed against what is deployed. A tidy-up here costs that.
//
// Regenerate with the Better Auth CLI reading the *configured* adapter:
//
//     npx auth@1.7.3 generate --config <auth config> --output server/db/schema/auth.ts
//
// ⚠️ `04` §8 and `08` §7 both write that command as
// `npx auth@latest generate --adapter drizzle --dialect pg`. Measured
// 2026-09-09: those two flags make the CLI synthesise an adapter instead of
// reading the configured one, and the configured one is where `schemaName`
// lives — so they emit `pgTable(...)` in `public` and silently drop the `auth`
// schema this section exists to create. Both documents are amended.
//
// Two things here are load-bearing and neither is ours to change:
//
//   - `user.id` is `text`, not `uuid`. Better Auth mints string ids itself, so
//     every `owner_id` in `04` is `text` while every other key is `uuid`
//     (verification §10.2). That mixed pair is the visible seam of a table this
//     project does not own, and it is cheaper to look at than to hide (`04` §3).
//   - ⚠️ Every child of `user` below carries `onDelete: "cascade"`, and that is
//     CORRECT here — a sign-in regenerates a session and an account. The rule is
//     not "no cascades"; it is that a cascade must never reach a table that
//     cannot be rebuilt. `04` §3 uses `RESTRICT` for personal entities instead,
//     and `personal.ts` is where that is enforced.
//
// The timestamps below are `timestamp`, not `timestamptz`, which is the one
// place the generator disagrees with `04` §1's convention. It stands as
// generated: `08` §7 chose regenerate-and-diff over house style for these four
// tables, and Better Auth reads and writes them, not us.

import { relations } from "drizzle-orm";
import { pgSchema, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const authSchema = pgSchema("auth");

export const user = authSchema.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = authSchema.table(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = authSchema.table(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = authSchema.table(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
