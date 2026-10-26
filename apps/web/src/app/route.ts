/**
 * Minimal path routing.
 *
 * A router library would be more machinery than this app needs: there are two
 * pages and one dynamic segment. Keeping it a pure function also makes the
 * parsing testable without a browser.
 */
export type Route =
  | { name: "home" }
  | { name: "challenge"; challengeId: string }
  | { name: "unknown"; path: string };

const CHALLENGE_PREFIX = "/c/";

export function parseRoute(pathname: string): Route {
  if (pathname === "/" || pathname === "") {
    return { name: "home" };
  }

  if (pathname.startsWith(CHALLENGE_PREFIX)) {
    const raw = pathname.slice(CHALLENGE_PREFIX.length);
    // Trim a trailing slash and any query-less remainder, then decode.
    const challengeId = decodeURIComponent(raw.replace(/\/+$/, ""));

    if (challengeId.length === 0) {
      return { name: "unknown", path: pathname };
    }

    return { name: "challenge", challengeId };
  }

  return { name: "unknown", path: pathname };
}
