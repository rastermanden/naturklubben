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
import type * as auth from "../auth.js";
import type * as authEmail from "../authEmail.js";
import type * as authz from "../authz.js";
import type * as badges from "../badges.js";
import type * as bracket from "../bracket.js";
import type * as calendar from "../calendar.js";
import type * as calendarFeed from "../calendarFeed.js";
import type * as chat from "../chat.js";
import type * as chatPolls from "../chatPolls.js";
import type * as crons from "../crons.js";
import type * as gallery from "../gallery.js";
import type * as games from "../games.js";
import type * as http from "../http.js";
import type * as members from "../members.js";
import type * as notifications from "../notifications.js";
import type * as observations from "../observations.js";
import type * as passwordCrypto from "../passwordCrypto.js";
import type * as passwords from "../passwords.js";
import type * as planTypes from "../planTypes.js";
import type * as probation from "../probation.js";
import type * as previewSeed from "../previewSeed.js";
import type * as push from "../push.js";
import type * as pushSend from "../pushSend.js";
import type * as roundRobin from "../roundRobin.js";
import type * as rules from "../rules.js";
import type * as tables_calendar from "../tables/calendar.js";
import type * as tables_chat from "../tables/chat.js";
import type * as tables_community from "../tables/community.js";
import type * as tables_gallery from "../tables/gallery.js";
import type * as tables_members from "../tables/members.js";
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
  auth: typeof auth;
  authEmail: typeof authEmail;
  authz: typeof authz;
  badges: typeof badges;
  bracket: typeof bracket;
  calendar: typeof calendar;
  calendarFeed: typeof calendarFeed;
  chat: typeof chat;
  chatPolls: typeof chatPolls;
  crons: typeof crons;
  gallery: typeof gallery;
  games: typeof games;
  http: typeof http;
  members: typeof members;
  notifications: typeof notifications;
  observations: typeof observations;
  passwordCrypto: typeof passwordCrypto;
  passwords: typeof passwords;
  planTypes: typeof planTypes;
  probation: typeof probation;
  previewSeed: typeof previewSeed;
  push: typeof push;
  pushSend: typeof pushSend;
  roundRobin: typeof roundRobin;
  rules: typeof rules;
  "tables/calendar": typeof tables_calendar;
  "tables/chat": typeof tables_chat;
  "tables/community": typeof tables_community;
  "tables/gallery": typeof tables_gallery;
  "tables/members": typeof tables_members;
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

export declare const components: {};
