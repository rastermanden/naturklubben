/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as announcements from "../announcements.js";
import type * as assistantMention from "../assistantMention.js";
import type * as assistantMentionMail from "../assistantMentionMail.js";
import type * as audio from "../audio.js";
import type * as auth from "../auth.js";
import type * as authEmail from "../authEmail.js";
import type * as authEmailSender from "../authEmailSender.js";
import type * as authMailGate from "../authMailGate.js";
import type * as authUsers from "../authUsers.js";
import type * as authz from "../authz.js";
import type * as badges from "../badges.js";
import type * as bracket from "../bracket.js";
import type * as calendar from "../calendar.js";
import type * as calendarFeed from "../calendarFeed.js";
import type * as chat from "../chat.js";
import type * as chatPolls from "../chatPolls.js";
import type * as crons from "../crons.js";
import type * as datePolls from "../datePolls.js";
import type * as emailProbe from "../emailProbe.js";
import type * as gallery from "../gallery.js";
import type * as games from "../games.js";
import type * as http from "../http.js";
import type * as meals from "../meals.js";
import type * as members from "../members.js";
import type * as migrateV1 from "../migrateV1.js";
import type * as notifications from "../notifications.js";
import type * as observations from "../observations.js";
import type * as passwordCrypto from "../passwordCrypto.js";
import type * as passwords from "../passwords.js";
import type * as planTypes from "../planTypes.js";
import type * as probation from "../probation.js";
import type * as previewMemberAuth from "../previewMemberAuth.js";
import type * as previewSeed from "../previewSeed.js";
import type * as push from "../push.js";
import type * as pushSend from "../pushSend.js";
import type * as roundRobin from "../roundRobin.js";
import type * as rules from "../rules.js";
import type * as tables_audio from "../tables/audio.js";
import type * as tables_calendar from "../tables/calendar.js";
import type * as tables_chat from "../tables/chat.js";
import type * as tables_community from "../tables/community.js";
import type * as tables_gallery from "../tables/gallery.js";
import type * as tables_members from "../tables/members.js";
import type * as tables_migrate from "../tables/migrate.js";
import type * as tables_notifications from "../tables/notifications.js";
import type * as tournaments from "../tournaments.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  announcements: typeof announcements;
  assistantMention: typeof assistantMention;
  assistantMentionMail: typeof assistantMentionMail;
  audio: typeof audio;
  auth: typeof auth;
  authEmail: typeof authEmail;
  authEmailSender: typeof authEmailSender;
  authMailGate: typeof authMailGate;
  authUsers: typeof authUsers;
  authz: typeof authz;
  badges: typeof badges;
  bracket: typeof bracket;
  calendar: typeof calendar;
  calendarFeed: typeof calendarFeed;
  chat: typeof chat;
  chatPolls: typeof chatPolls;
  crons: typeof crons;
  datePolls: typeof datePolls;
  emailProbe: typeof emailProbe;
  gallery: typeof gallery;
  games: typeof games;
  meals: typeof meals;
  http: typeof http;
  members: typeof members;
  migrateV1: typeof migrateV1;
  notifications: typeof notifications;
  observations: typeof observations;
  passwordCrypto: typeof passwordCrypto;
  passwords: typeof passwords;
  planTypes: typeof planTypes;
  probation: typeof probation;
  previewMemberAuth: typeof previewMemberAuth;
  previewSeed: typeof previewSeed;
  push: typeof push;
  pushSend: typeof pushSend;
  roundRobin: typeof roundRobin;
  rules: typeof rules;
  "tables/audio": typeof tables_audio;
  "tables/calendar": typeof tables_calendar;
  "tables/chat": typeof tables_chat;
  "tables/community": typeof tables_community;
  "tables/gallery": typeof tables_gallery;
  "tables/members": typeof tables_members;
  "tables/migrate": typeof tables_migrate;
  "tables/notifications": typeof tables_notifications;
  tournaments: typeof tournaments;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authEmail: import("@convex-dev/auth/components/email/_generated/component.js").ComponentApi<"authEmail">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
