import { describe, expect, it } from "vitest";
import { loginOptions, SPOTIFY_SCOPES } from "@/lib/auth/scopes";

describe("loginOptions", () => {
  it("builds the redirect from the request origin and asks for the ingestion scopes", () => {
    expect(loginOptions("https://spotdonalds.vercel.app")).toEqual({
      redirectTo: "https://spotdonalds.vercel.app/auth/callback",
      scopes: SPOTIFY_SCOPES,
    });
    expect(SPOTIFY_SCOPES.split(" ").sort()).toEqual([
      "user-read-email",
      "user-read-recently-played",
      "user-top-read",
    ]);
  });
});
