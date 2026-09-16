import Link from "next/link";
import { getReport, pstatsDir } from "@/lib/data.server";
import {
  campaignLabel,
  campaignMetrics,
  formatDate,
  formatDuration,
  formatNumber,
} from "@/lib/metrics";
import CasualtyStrip, { CasualtyLegend } from "@/components/CasualtyStrip";
import {
  CampaignMark,
  CustomTag,
  DedupeNotice,
  DifficultyStamp,
  Empty,
  FailureNotice,
  SectionHead,
  StatusTag,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const { store } = await getReport();

  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 pb-24">
      <header className="rise border-b border-rule py-10">
        <div className="eyebrow mb-3">Campaign log</div>
        <h1 className="display text-[clamp(2.2rem,5vw,3.4rem)] text-ink">
          Every run, newest first
        </h1>
        {store.sessions.length > 0 && (
          <div className="mt-6">
            <CasualtyLegend />
          </div>
        )}
      </header>

      {store.failures.length > 0 && (
        <div className="py-6">
          <FailureNotice failures={store.failures} />
        </div>
      )}
      {store.dropped.length > 0 && (
        <div className="py-6">
          <DedupeNotice dropped={store.dropped} />
        </div>
      )}

      {store.sessions.length === 0 ? (
        <div className="py-12">
          <Empty
            title="No campaigns found"
            body={`Nothing to log yet. PSTATS is reading ${pstatsDir()} — point it at your game folder, or load files by hand.`}
            action={
              <Link
                href="/load"
                className="eyebrow border border-rule-bright px-4 py-2 text-ink-dim transition-colors hover:border-ink-faint hover:text-ink"
              >
                Load files
              </Link>
            }
          />
        </div>
      ) : (
        <section className="py-10">
          <SectionHead
            label={`${store.sessions.length} campaigns`}
            note={
              store.anyTimeApproximate
                ? "Some files have no timestamp; their order is inferred"
                : undefined
            }
          />

          <div className="divide-y divide-rule">
            {store.sessions.map((s) => {
              const m = campaignMetrics(s);
              return (
                <Link
                  key={s.sessionId}
                  href={`/campaigns/${encodeURIComponent(s.sessionId)}`}
                  className="link-row block py-6"
                >
                  {/* The strip used to take the wider half, which made it
                      the loudest thing in a row that is mostly text and
                      left the poster rattling around in a tall, empty
                      column. Narrowing it to a third hands that width back
                      to the names and figures, and the height it frees is
                      what the bigger poster now fills. The strip still
                      reads fine small -- it encodes proportion, and
                      proportion survives scaling. */}
                  <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
                    <div className="flex min-w-0 items-start gap-5">
                      {/* The poster is the row's left edge, so the eye can
                          find a campaign in the log by its art before it
                          reads the name. Sized to run the full height of
                          the text beside it rather than floating at the
                          top of it. */}
                      <CampaignMark
                        campaign={s.campaign}
                        label={campaignLabel(s.campaign, s.official)}
                        height={124}
                        className="mt-1"
                      />
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-3">
                          <h3 className="display text-[1.5rem] text-ink">
                            {campaignLabel(s.campaign, s.official)}
                          </h3>
                          {!s.official && <CustomTag />}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                          <DifficultyStamp
                            raw={s.difficulty}
                            label={s.difficultyDisplay}
                            gamemode={s.gamemode}
                            size="sm"
                          />
                          <StatusTag complete={s.complete} wipes={s.wipes} />
                          <span className="mono text-[0.68rem] text-ink-faint">
                            {formatDate(s.startedUtc)}
                          </span>
                          <span className="mono text-[0.68rem] text-ink-faint">
                            {s.gamemode}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-x-7 gap-y-2">
                          <Figure
                            value={formatDuration(s.playtimeS)}
                            label="duration"
                          />
                          <Figure
                            value={String(m.chapterCount)}
                            label="chapters"
                          />
                          <Figure
                            value={formatNumber(m.totalKills)}
                            label="kills"
                          />
                          <Figure
                            value={formatNumber(m.totalIncaps)}
                            label="incaps"
                          />
                          <Figure
                            value={formatNumber(m.totalDeaths)}
                            label="deaths"
                            tone={m.totalDeaths > 0 ? "harm" : undefined}
                          />
                          <Figure
                            value={formatNumber(m.totalFfDamage)}
                            label="ff dmg"
                            tone={m.totalFfDamage > 0 ? "harm" : undefined}
                          />
                        </div>

                        {/* Humans only. A co-op run fills the empty slots
                            with bots, so listing them puts "Coach (bot)"
                            next to the people you actually played with and
                            buries the answer to "who was on this run?".
                            The detail page still shows the full roster,
                            where the bots are a fact about the team rather
                            than noise in an index. */}
                        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {m.players
                            .filter((p) => p.kind !== "bot")
                            .map((p) => (
                              <span
                                key={p.key}
                                className="text-[0.75rem] text-ink-mute"
                              >
                                {p.label}
                              </span>
                            ))}
                        </div>
                      </div>
                    </div>

                    <div className="self-center">
                      <CasualtyStrip
                        chapters={m.chapterLoad}
                        height={40}
                        animate={false}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

function Figure({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: "harm";
}) {
  return (
    <div>
      <div
        className={`mono text-[0.9rem] ${
          tone === "harm" ? "text-harm" : "text-ink"
        }`}
      >
        {value}
      </div>
      <div className="eyebrow mt-0.5">{label}</div>
    </div>
  );
}
