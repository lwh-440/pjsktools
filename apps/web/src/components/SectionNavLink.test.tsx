import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, NavLink } from "react-router";
import { SectionNavLink } from "./SectionNavLink";

function activeLinks(entries: string[], className = "nav-item") {
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
    {["home", "about", "tools", "stories", "live2d"].map((id) => <SectionNavLink key={id} sectionId={id} className={className}>{id}</SectionNavLink>)}
    {["login", "register"].map((id) => <NavLink key={id} to={`/${id}`} className={({ isActive }) => `${className} ${isActive ? "active" : ""}`}>{id}</NavLink>)}
  </MemoryRouter>);
  return [...html.matchAll(/<a\b([^>]*)>([^<]+)<\/a>/g)]
    .filter(([, attributes]) => /class="[^"]*\bactive\b/.test(attributes))
    .map(([, , label]) => label);
}

describe.each(["nav-item", "magazine-quick-nav-item"])("%s route highlighting", (className) => {
  it.each(["login", "register"])("clears about when navigating to %s", (account) => {
    expect(activeLinks(["/section/about", `/${account}`], className)).toEqual([account]);
    expect(activeLinks([`/${account}`, "/section/about"], className)).toEqual(["about"]);
  });

  it.each(["/privacy", "/terms", "/me/profile", "/auth/qq/callback"])("leaves no stale section on %s", (path) => {
    expect(activeLinks(["/section/about", path], className)).toEqual([]);
  });

  it.each([
    ["/", "home"], ["/section/home", "home"], ["/section/home/", "home"],
    ["/section/tools", "tools"], ["/section/stories/event/123", "stories"],
    ["/section/live2d/model-123", "live2d"]
  ])("keeps the current section highlighted on %s", (path, expected) => {
    expect(activeLinks(["/section/about", path], className)).toEqual([expected]);
  });

  it("does not match a different section with the same prefix", () => {
    expect(activeLinks(["/section/about", "/section/stories-other"], className)).toEqual([]);
  });
});
