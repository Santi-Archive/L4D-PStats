"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * The primary navigation rail.
 *
 * Three tabs, because there are three questions this app answers: how are we
 * doing overall, what happened in that run, and how does this player play.
 * Everything else (friendly fire, loading files) is a utility rather than a
 * destination, so it sits at the foot of the rail in a quieter register
 * rather than competing with the three.
 *
 * A rail rather than a top bar: the tables here are wide and numeric, and a
 * fixed vertical column gives the eye a stable left edge to return to when
 * scanning back from a right-aligned figure. It also stops costing vertical
 * space on a page whose content is mostly long tables.
 */

const TABS = [
  {
    href: "/",
    label: "Overview",
    note: "Every campaign, every run",
    /** Only "/" itself, never a prefix — it would match all routes. */
    exact: true,
  },
  { href: "/campaigns", label: "Campaigns", note: "Run by run" },
  { href: "/survivors", label: "Survivors", note: "Player records" },
] as const;

const UTILITIES = [
  { href: "/compare", label: "Compare players" },
  { href: "/friendly-fire", label: "Friendly fire" },
  { href: "/load", label: "Load files" },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  // Mobile only. The rail is always present from `lg` up, where this is
  // ignored entirely.
  const [open, setOpen] = useState(false);

  // A navigation that leaves the drawer open would cover the page it just
  // navigated to.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes the drawer, matching every other overlay on the platform.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    if (pathname === href) return true;
    return pathname.startsWith(`${href}/`);
  }

  // The player detail route lives under /players/[key] but belongs to the
  // Survivors tab, so the tab stays lit while you are reading one.
  const survivorsActive =
    isActive("/survivors") || pathname.startsWith("/players/");

  return (
    <>
      {/* Mobile bar. The rail itself is off-canvas below `lg`. */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-rule bg-ground/92 px-4 backdrop-blur-sm lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="flex h-9 w-9 shrink-0 items-center justify-center border border-rule text-ink-dim transition-colors hover:border-rule-bright hover:text-ink"
        >
          <span aria-hidden className="flex flex-col gap-[3px]">
            <span className="block h-px w-4 bg-current" />
            <span className="block h-px w-4 bg-current" />
            <span className="block h-px w-4 bg-current" />
          </span>
        </button>
        <Link
          href="/"
          className="display text-[1.05rem] tracking-[0.16em] text-ink"
        >
          PSTATS
        </Link>
      </header>

      {/* Scrim. Only mounted while open so it never eats clicks otherwise. */}
      {open && (
        <button
          aria-hidden
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ground/70 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[15.5rem] flex-col border-r border-rule bg-ground transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-rule px-5">
          <Link
            href="/"
            className="display text-[1.15rem] tracking-[0.16em] text-ink transition-colors hover:text-clear"
          >
            PSTATS
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="text-ink-mute transition-colors hover:text-ink lg:hidden"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>

        <nav
          className="scroll-slim flex-1 overflow-y-auto py-5"
          aria-label="Primary"
        >
          <ul>
            {TABS.map((t) => {
              const active =
                t.href === "/survivors"
                  ? survivorsActive
                  : isActive(t.href, "exact" in t ? t.exact : false);
              return (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className={`group relative block px-5 py-3 transition-colors ${
                      active
                        ? "bg-raised text-ink"
                        : "text-ink-mute hover:bg-raised/50 hover:text-ink-dim"
                    }`}
                  >
                    {/* The active marker is a rule in the harm tone, the same
                        device the old top bar used for its underline. */}
                    <span
                      aria-hidden
                      className={`absolute inset-y-0 left-0 w-[2px] transition-colors ${
                        active ? "bg-harm" : "bg-transparent"
                      }`}
                    />
                    <span className="block text-[0.9rem]">{t.label}</span>
                    <span className="eyebrow mt-1 block !text-[0.58rem] normal-case tracking-[0.06em] text-ink-faint">
                      {t.note}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-rule px-5 py-4">
          <ul className="space-y-2.5">
            {UTILITIES.map((u) => {
              const active = isActive(u.href);
              return (
                <li key={u.href}>
                  <Link
                    href={u.href}
                    aria-current={active ? "page" : undefined}
                    className={`eyebrow block transition-colors ${
                      active ? "text-ink-dim" : "hover:text-ink-dim"
                    }`}
                  >
                    {u.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </>
  );
}
