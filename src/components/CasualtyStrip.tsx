import { chapterLabel, formatDuration, type ChapterLoad } from "@/lib/metrics";

/**
 * The signature element.
 *
 * One horizontal band per campaign. Each chapter is a segment whose width is
 * proportional to its real duration, tinted by outcome, with a tick mark for
 * every incap and a heavier mark for every death. One glance answers the
 * question you actually have after a session: where did this run go wrong?
 *
 * This encodes real structure rather than decorating: chapters genuinely are
 * an ordered sequence, duration genuinely varies, and casualties genuinely
 * cluster. Nothing else on the page is allowed to be this loud.
 */
export default function CasualtyStrip({
  chapters,
  height = 56,
  showLabels = true,
  animate = true,
}: {
  chapters: ChapterLoad[];
  height?: number;
  showLabels?: boolean;
  animate?: boolean;
}) {
  const total = chapters.reduce((a, c) => a + c.playtimeS, 0);
  if (chapters.length === 0 || total <= 0) return null;

  return (
    <div>
      <div
        className={`flex w-full gap-px overflow-hidden bg-rule ${
          animate ? "strip-in" : ""
        }`}
        style={{ height }}
      >
        {chapters.map((c) => {
          const share = (c.playtimeS / total) * 100;
          const tone =
            c.outcome === "wipe"
              ? "bg-harm/[0.14]"
              : c.outcome === "finale_win"
                ? "bg-clear/[0.10]"
                : c.outcome === "in_progress"
                  ? "bg-ink/[0.03]"
                  : "bg-ink/[0.045]";
          const edge =
            c.outcome === "wipe"
              ? "border-t-harm"
              : c.outcome === "finale_win"
                ? "border-t-clear"
                : "border-t-rule-bright";

          return (
            <div
              key={`${c.index}-${c.map}`}
              className={`group relative border-t-2 ${edge} ${tone} min-w-0`}
              style={{ flexBasis: `${share}%` }}
              title={`${c.index}. ${chapterLabel(c.map)} — ${formatDuration(
                c.playtimeS,
              )}, ${c.incaps} incap${c.incaps === 1 ? "" : "s"}, ${
                c.deaths
              } death${c.deaths === 1 ? "" : "s"}`}
            >
              {/*
                Casualty ticks along the segment's baseline. Deaths first so
                they are never pushed out of view by a long incap run.
              */}
              <div className="absolute inset-x-0 bottom-0 flex items-end gap-[2px] px-[4px] pb-[4px]">
                {Array.from({ length: Math.min(c.deaths, 10) }).map((_, i) => (
                  <span
                    key={`d${i}`}
                    className="w-[3px] flex-none bg-harm"
                    style={{ height: Math.round(height * 0.52) }}
                  />
                ))}
                {Array.from({ length: Math.min(c.incaps, 30) }).map((_, i) => (
                  <span
                    key={`i${i}`}
                    className="w-[2px] flex-none bg-harm/50"
                    style={{ height: Math.round(height * 0.24) }}
                  />
                ))}
              </div>

              {/* Chapter number, top-left inside the segment. */}
              <div className="mono absolute left-[5px] top-[3px] text-[0.6rem] leading-none text-ink-faint">
                {String(c.index).padStart(2, "0")}
              </div>

              {c.retried && (
                <div
                  className="mono absolute right-[5px] top-[3px] text-[0.58rem] leading-none text-harm/80"
                  title="Chapter was replayed"
                >
                  ↻
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showLabels && (
        <div className="mt-2 flex w-full gap-px">
          {chapters.map((c) => {
            const share = (c.playtimeS / total) * 100;
            return (
              <div
                key={`l-${c.index}-${c.map}`}
                className="min-w-0 overflow-hidden"
                style={{ flexBasis: `${share}%` }}
              >
                <div className="truncate text-[0.7rem] text-ink-dim">
                  {chapterLabel(c.map)}
                </div>
                <div className="mono text-[0.62rem] text-ink-faint">
                  {formatDuration(c.playtimeS)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Legend, shown once per page rather than beside every strip. */
export function CasualtyLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.68rem] text-ink-mute">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-[10px] w-[2px] bg-harm/45" />
        incap
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-[13px] w-[3px] bg-harm" />
        death
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-[2px] w-4 bg-clear" />
        finale won
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-[2px] w-4 bg-harm" />
        wiped
      </span>
      <span className="text-ink-faint">segment width = chapter duration</span>
    </div>
  );
}
