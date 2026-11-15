import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DriveThrough } from "@/components/flow/DriveThrough";
import { Welcome } from "@/components/flow/Welcome";

describe("Welcome", () => {
  it("can hold as a loading page", () => {
    const html = renderToStaticMarkup(<Welcome hold />);
    expect(html).toContain("Please drive through");
    expect(html).toContain('role="status"');
  });
});

describe("DriveThrough", () => {
  it("covers a return visit with the drive-through page while it loads", () => {
    const html = renderToStaticMarkup(<DriveThrough welcome={false} />);
    expect(html).toContain("Please drive through");
  });

  it("shows the welcome after sign-in", () => {
    const html = renderToStaticMarkup(<DriveThrough welcome />);
    expect(html).toContain("Please drive through");
  });
});
