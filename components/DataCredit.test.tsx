import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DATA_CREDIT, DataCredit } from "@/components/DataCredit";

describe("DataCredit", () => {
  it("renders the attribution line", () => {
    expect(DATA_CREDIT).toBe("Data provided by Spotify, MusicBrainz, and Deezer.");
    expect(renderToStaticMarkup(<DataCredit />)).toContain(DATA_CREDIT);
  });
});
