/** Shared by the proxy (no server-only imports) and the session layer. "__Host-" requires Secure → prod only. */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-kornne_admin" : "kornne_admin";
