import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  type Art,
  campaignPoster,
  chapterStill,
  survivorPortrait,
} from "@/lib/art";
import { difficultyRank, isRealism } from "@/lib/normalize";
import type { ChapterOutcome } from "@/lib/schema";

/**
 * The masthead every top-level tab opens with.
 *
 * Extracted once the rail made the three tabs siblings: they have to open
 * the same way for the rail's selection to feel like it moved you somewhere
 * within one app rather than to three pages that happen to be linked.
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="rise border-b border-rule py-9">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="eyebrow mb-3">{eyebrow}</div>
          <h1 className="display text-[clamp(2rem,4.5vw,3rem)] text-ink">
            {title}
          </h1>
          {lede && (
            <p className="mt-3.5 max-w-xl text-[0.85rem] leading-relaxed text-ink-mute">
              {lede}
            </p>
          )}
        </div>
        {children}
      </div>
    </header>
  );
}

/** Section header: eyebrow label, optional note on the right. */
export function SectionHead({
  label,
  note,
  tight = false,
  children,
}: {
  label: string;
  note?: ReactNode;
  /** Less air beneath, for a section on a fixed height budget. */
  tight?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 border-b border-rule ${
        tight ? "mb-2.5 pb-1.5" : "mb-4 pb-2"
      }`}
    >
      <h2 className="eyebrow">{label}</h2>
      {note && <div className="text-[0.7rem] text-ink-mute">{note}</div>}
      {children}
    </div>
  );
}

/**
 * Headline stat. Big display number, muted label beneath -- the type scale
 * does the work, so no card chrome, no icon, no accent unless it is harm.
 */
export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  size = "lg",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "harm" | "clear";
  size?: "lg" | "md" | "sm";
}) {
  const toneClass =
    tone === "harm" ? "text-harm" : tone === "clear" ? "text-clear" : "text-ink";
  const sizeClass =
    size === "lg"
      ? "text-[2.6rem] md:text-[3.1rem]"
      : size === "md"
        ? "text-[2rem]"
        : "text-[1.4rem]";

  return (
    <div>
      <div className={`metric ${sizeClass} ${toneClass}`}>{value}</div>
      <div className="eyebrow mt-2">{label}</div>
      {sub && (
        <div className="mono mt-1 text-[0.7rem] text-ink-faint">{sub}</div>
      )}
    </div>
  );
}

/**
 * Difficulty as a stencil overprint rather than a badge.
 *
 * PLAN.md section 6: an Expert run with three wipes must not look like a
 * Normal walkthrough. Harder difficulties get more rotation and a heavier
 * rule, so the emphasis is structural rather than a colour swap.
 */
export function DifficultyStamp({
  raw,
  label,
  gamemode = "",
  size = "md",
}: {
  raw: string;
  label: string;
  /**
   * Needed because Expert Realism is a difficulty/gamemode pair rather than
   * a fifth z_difficulty value. Optional: call sites that genuinely have no
   * single gamemode (the campaign rollups span runs) fall back to the
   * difficulty ramp alone rather than claiming a mode they cannot know.
   */
  gamemode?: string;
  size?: "md" | "sm";
}) {
  const rank = difficultyRank(raw);
  const realism = isRealism(gamemode) && rank === 4;
  // Emphasis climbs with difficulty on two axes at once: the colour ramp
  // below, and the rotation/rule weight carried by the stamp classes. Colour
  // alone would collapse for a colour-blind reader; structure alone was too
  // quiet to separate Normal from Advanced at a glance.
  const cls = realism
    ? "stamp stamp-realism"
    : rank >= 4
      ? "stamp stamp-expert"
      : rank === 3
        ? "stamp stamp-advanced"
        : rank === 2
          ? "stamp stamp-normal"
          : "stamp stamp-easy";
  const fontSize = size === "sm" ? "text-[0.62rem]" : "text-[0.72rem]";
  return (
    <span
      className={`${cls} ${fontSize}`}
      title={
        realism
          ? `z_difficulty: ${raw} · mp_gamemode: ${gamemode}`
          : `z_difficulty: ${raw}`
      }
    >
      {label}
    </span>
  );
}

const OUTCOME_STYLE: Record<
  ChapterOutcome,
  { label: string; className: string }
> = {
  finale_win: { label: "Finale won", className: "text-clear" },
  cleared: { label: "Cleared", className: "text-ink-dim" },
  wipe: { label: "Wiped", className: "text-harm" },
  in_progress: { label: "In progress", className: "text-ink-mute" },
};

export function OutcomeTag({
  outcome,
  raw,
}: {
  outcome: ChapterOutcome;
  raw?: string;
}) {
  const s = OUTCOME_STYLE[outcome];
  // An unrecognized outcome shows its real value rather than a polite lie.
  const unknown = raw !== undefined && raw !== outcome;
  return (
    <span className={`eyebrow ${s.className}`} title={unknown ? raw : undefined}>
      {unknown ? raw : s.label}
    </span>
  );
}

/** Campaign completion state, which is not the same as chapter outcome. */
export function StatusTag({
  complete,
  wipes,
}: {
  complete: boolean;
  wipes: number;
}) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={`eyebrow ${complete ? "text-clear" : "text-ink-mute"}`}>
        {complete ? "Complete" : "Unfinished"}
      </span>
      {wipes > 0 && (
        <span className="eyebrow text-harm">
          {wipes} wipe{wipes === 1 ? "" : "s"}
        </span>
      )}
    </span>
  );
}

/** Marks a campaign that is not one of Valve's. */
export function CustomTag() {
  return (
    <span
      className="eyebrow border border-rule-bright px-1.5 py-0.5 text-ink-mute"
      title="Custom or Workshop campaign"
    >
      Custom
    </span>
  );
}

export function BotTag() {
  return <span className="eyebrow text-ink-faint">bot</span>;
}

/*
  ---- Art ----

  Posters, stills and portraits are identifying marks, not illustration.
  Three rules hold them to that:

    - Every one of them is optional. `lib/art.ts` returns null for a custom
      campaign, an unknown survivor or a map it cannot place, so each
      component here renders a typographic fallback instead of a gap.
    - They sit behind a border and a slight desaturation, so a poster's
      colour never competes with the harm/clear tones that carry meaning.
    - They are `aria-hidden` wherever the name they decorate is already in
      the DOM beside them. A screen reader should hear "Dead Center" once,
      not "Dead Center poster, Dead Center".
*/

/**
 * A survivor's portrait, or their initial.
 *
 * `character` is the mod's own string and is often empty -- bots that were
 * swapped out, or files from before the field existed -- so the fallback is
 * not an edge case, it is the common path on older runs.
 */
export function SurvivorMark({
  character,
  label,
  size = 22,
}: {
  character: string;
  /** The player name, used for the fallback initial and the alt text. */
  label: string;
  size?: number;
}) {
  const art = survivorPortrait(character);
  // Square by construction, so the fallback tile and the real portrait are
  // interchangeable in a row -- swapping one for the other never reflows.
  const box = { width: size, height: size };

  if (!art) {
    const initial = (label.trim()[0] ?? "?").toUpperCase();
    return (
      <span
        aria-hidden
        title={character || undefined}
        style={box}
        className="mono inline-flex shrink-0 select-none items-center justify-center border border-rule bg-raised text-[0.6rem] leading-none text-ink-faint"
      >
        {initial}
      </span>
    );
  }

  return (
    <Image
      src={art.src}
      alt=""
      aria-hidden
      title={character}
      {...renderSize(art, size)}
      style={box}
      className="shrink-0 border border-rule object-cover opacity-90"
    />
  );
}

/**
 * The pixel size to hand `next/image`, given a box width in CSS pixels.
 *
 * `art.width`/`art.height` are a ratio, not a size, so they cannot be passed
 * through: a 3x4 poster would ask the optimizer for a three-pixel-wide
 * image. What the optimizer actually needs is the ratio scaled to the box,
 * which fixes the aspect (no layout shift) and asks for enough detail to
 * survive a 2x display.
 */
function renderSize(art: Art, boxWidth: number) {
  const scale = 2;
  return {
    width: Math.round(boxWidth * scale),
    height: Math.round((boxWidth * art.height * scale) / art.width),
  };
}

/**
 * A campaign's poster, in a 3:4 box.
 *
 * Most custom campaigns have no poster and never will -- finding art for a
 * Workshop map is manual work with no guaranteed result -- so the fallback
 * is not a rare path and is not allowed to look like a failure. It is a
 * tile of the same 3:4 box carrying the campaign's initials, which keeps
 * the row's left edge aligned and still tells you which run you are
 * looking at.
 */
export function CampaignMark({
  campaign,
  label,
  height = 30,
  className = "",
}: {
  campaign: string;
  label: string;
  /** Posters are 3:4; width follows from this. */
  height?: number;
  className?: string;
}) {
  const art = campaignPoster(campaign);
  const width = Math.round((height * 3) / 4);
  const box = { width, height };

  if (!art) {
    // Up to two initials from the label -- "Dam It" reads as DI, a
    // one-word name as its first letter. Scaled off the box so the same
    // fallback works at 30px in a row and at 200px on a detail page.
    const initials = label
      .split(/\s+/)
      .filter((w) => /[a-z0-9]/i.test(w))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("");
    return (
      <span
        aria-hidden
        title={label}
        style={{ ...box, fontSize: Math.max(9, Math.round(height * 0.2)) }}
        className={`mono inline-flex shrink-0 select-none items-center justify-center border border-rule bg-raised leading-none tracking-[0.1em] text-ink-faint ${className}`}
      >
        {initials || "?"}
      </span>
    );
  }

  return (
    <Image
      src={art.src}
      alt=""
      aria-hidden
      title={label}
      {...renderSize(art, width)}
      style={box}
      className={`shrink-0 border border-rule object-cover opacity-90 ${className}`}
    />
  );
}

/**
 * A chapter's loading still, in a fixed 21:10 box.
 *
 * Sized by an explicit width rather than by the container: a still left to
 * fill its parent swallows the section it decorates. The height follows
 * from the shared ratio rather than from the file, so two stills at the
 * same width are always the same height -- the captures are not uniform and
 * the layout must not inherit that.
 */
export function ChapterStill({
  map,
  label,
  width = 132,
  className = "",
}: {
  map: string;
  label: string;
  width?: number;
  className?: string;
}) {
  const art = chapterStill(map);
  if (!art) return null;
  const box = {
    width,
    height: Math.round((width * art.height) / art.width),
  };
  return (
    <Image
      src={art.src}
      alt=""
      aria-hidden
      title={label}
      {...renderSize(art, width)}
      style={box}
      className={`shrink-0 border border-rule object-cover opacity-85 ${className}`}
    />
  );
}

/**
 * Row emphasis for a focused player.
 *
 * Selecting a player never removes the other rows. A per-player number only
 * means something against the people next to it -- a table cut to one row
 * throws away the comparison that makes "142 kills" readable -- so the
 * teammates stay put and recede instead.
 */
export function rowFocus(
  key: string,
  selected: string | null,
): string {
  if (selected === null) return "";
  return key === selected
    ? "bg-raised"
    : "opacity-40 transition-opacity hover:opacity-75";
}

/**
 * Designed empty state, not an afterthought (PLAN.md section 6). An empty
 * screen is an invitation to act, so it always offers the next step.
 */
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-rule-bright px-8 py-16 text-center">
      <h3 className="display text-[1.2rem] text-ink-dim">{title}</h3>
      <p className="mx-auto mt-3 max-w-sm text-[0.85rem] leading-relaxed text-ink-mute">
        {body}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Parse failures get a real message, never a white screen. */
export function FailureNotice({
  failures,
}: {
  failures: { fileName: string; error: string; issues: string[] }[];
}) {
  if (failures.length === 0) return null;
  return (
    <div className="border border-harm-dim bg-harm/[0.04] px-5 py-4">
      <h3 className="eyebrow text-harm">
        {failures.length} file{failures.length === 1 ? "" : "s"} could not be
        read
      </h3>
      <ul className="mt-3 space-y-2">
        {failures.map((f) => (
          <li key={f.fileName} className="text-[0.78rem]">
            <span className="mono text-ink-dim">{f.fileName}</span>
            <span className="ml-2 text-ink-mute">{f.error}</span>
            {f.issues.length > 0 && (
              <ul className="mono mt-1 ml-4 space-y-0.5 text-[0.68rem] text-ink-faint">
                {f.issues.slice(0, 4).map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Explains a dedupe decision rather than silently dropping a file. */
export function DedupeNotice({
  dropped,
}: {
  dropped: {
    sessionId: string;
    kept: string;
    dropped: string;
    reason: string;
    keptSaves: number;
    droppedSaves: number;
  }[];
}) {
  if (dropped.length === 0) return null;
  return (
    <details className="group border border-rule px-5 py-3">
      <summary className="eyebrow cursor-pointer list-none text-ink-mute transition-colors hover:text-ink-dim">
        {dropped.length} duplicate file
        {dropped.length === 1 ? "" : "s"} ignored
      </summary>
      <ul className="mt-3 space-y-1.5 text-[0.75rem] text-ink-mute">
        {dropped.map((d) => (
          <li key={d.sessionId + d.dropped}>
            <span className="mono text-ink-dim">{d.dropped}</span> duplicates{" "}
            <span className="mono text-ink-dim">{d.kept}</span> — kept the copy
            with {d.reason} ({d.keptSaves} vs {d.droppedSaves} saves)
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Crumb({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="eyebrow inline-flex items-center gap-1.5 text-ink-mute transition-colors hover:text-ink-dim"
    >
      <span aria-hidden>←</span>
      {label}
    </Link>
  );
}

/**
 * A horizontal bar. Plain CSS rather than a chart library -- PLAN.md
 * section 2 says bars and the heatmap stay hand-built.
 */
export function Bar({
  value,
  max,
  color,
  height = 6,
}: {
  value: number;
  max: number;
  color: string;
  height?: number;
}) {
  const pct = max > 0 ? Math.max(value > 0 ? 1.5 : 0, (value / max) * 100) : 0;
  return (
    <div
      className="w-full bg-sunken"
      style={{ height }}
      role="presentation"
    >
      <div
        className="h-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}
