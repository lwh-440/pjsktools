import type { MouseEventHandler, ReactNode } from "react";
import { NavLink, useLocation } from "react-router";

export function SectionNavLink({ sectionId, className, onClick, children }: {
  sectionId: string;
  className: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const homeAlias = sectionId === "home" && /^\/section\/home\/?$/i.test(pathname);
  return <NavLink to={sectionId === "home" ? "/" : `/section/${sectionId}`} end={sectionId === "home"}
    onClick={onClick}
    className={({ isActive }) => `${className} ${isActive || homeAlias ? "active" : ""}`}>
    {children}
  </NavLink>;
}
