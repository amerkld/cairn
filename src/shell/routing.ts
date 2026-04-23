/**
 * The Phase 1 app has a fixed, small set of routes; we don't need a router.
 * `RouteContext` exposes the active page key + a setter; pages and the
 * sidebar consume it via hooks.
 *
 * When URL-based routing becomes useful (deep-linking into a note from a
 * notification, for example), swap this out — callers only touch the hooks,
 * not the implementation.
 */
import { createContext, useContext } from "react";

export type PageKey = "home" | "captures" | "someday" | "trash" | "project" | "editor";

/**
 * Routes the editor can return to. Each variant is a complete route descriptor
 * so a returnable target can carry its own context (e.g. a project's path).
 */
export type ReturnableRoute =
  | { page: "home" }
  | { page: "captures" }
  | { page: "someday" }
  | { page: "trash" }
  | { page: "project"; projectPath: string };

export type RouteState =
  | { page: "home" }
  | { page: "captures" }
  | { page: "someday" }
  | { page: "trash" }
  | { page: "project"; projectPath: string }
  | { page: "editor"; notePath: string; returnTo: ReturnableRoute };

export interface RouteApi {
  state: RouteState;
  navigate: (next: RouteState) => void;
}

const defaultRoute: RouteApi = {
  state: { page: "home" },
  navigate: () => {
    throw new Error("RouteProvider missing");
  },
};

export const RouteContext = createContext<RouteApi>(defaultRoute);

export function useRoute(): RouteApi {
  return useContext(RouteContext);
}
