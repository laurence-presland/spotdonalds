import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Landing } from "@/components/Landing";
import { NotAllowlisted } from "@/components/NotAllowlisted";

describe("Landing", () => {
  it("shows only the wordmark, the slogan, and the Spotify button", () => {
    const html = renderToStaticMarkup(<Landing />);
    expect(html).toContain('alt="SpotDonalds"');
    expect(html).toContain('src="/brand/wordmark-yellow.svg"');
    expect(html).toContain("Your Spotify taste assembled as a drive-through order.");
    expect(html).toContain("Log in with Spotify");
    expect(html).toContain('href="/auth/login"');
    expect(html).not.toContain("/icon");
    expect(html.toLowerCase()).not.toContain("recently played");
    expect(html.toLowerCase()).not.toContain("we read");
    expect(html.match(/<p/g)).toHaveLength(1);
  });

  it("adds a message when consent was denied", () => {
    const html = renderToStaticMarkup(<Landing notice="consent-denied" />);
    expect(html).toContain("Spotify sign-in was cancelled.");
    expect(html).toContain("Log in with Spotify");
  });
});

describe("NotAllowlisted", () => {
  it("explains development mode and how to ask for access", () => {
    const html = renderToStaticMarkup(<NotAllowlisted />);
    expect(html).toContain("This account isn&#x27;t on the list.");
    expect(html).toContain("Spotify development mode");
    expect(html).toContain("laurencepresland@gmail.com");
    expect(html).toContain("Back to the start");
  });
});
