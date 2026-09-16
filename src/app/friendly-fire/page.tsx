import Link from "next/link";
import { getReport } from "@/lib/data.server";
import { campaignLabel, ffMatrix } from "@/lib/metrics";
import FfMatrixView from "@/components/FfMatrixView";
import { Empty, SectionHead } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FriendlyFirePage() {
  const { store } = await getReport();

  const options = store.sessions.map((s) => ({
    sessionId: s.sessionId,
    label: campaignLabel(s.campaign, s.official),
    difficulty: s.difficultyDisplay,
  }));

  const allTime = ffMatrix(store.sessions);
  const perCampaign = Object.fromEntries(
    store.sessions.map((s) => [s.sessionId, ffMatrix([s])]),
  );

  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 pb-24">
      <header className="rise border-b border-rule py-10">
        <div className="eyebrow mb-3">Incident report</div>
        <h1 className="display text-[clamp(2.2rem,5vw,3.4rem)] text-ink">
          Who shoots whom
        </h1>
        <p className="mt-4 max-w-xl text-[0.88rem] leading-relaxed text-ink-mute">
          Friendly fire is directional. Rows are the player pulling the
          trigger; columns are the one taking it.
        </p>
      </header>

      {store.sessions.length === 0 ? (
        <div className="py-12">
          <Empty
            title="No incidents on record"
            body="Load some campaigns and this fills in on its own. It always does."
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
      ) : allTime.keys.length === 0 ? (
        <div className="py-12">
          <Empty
            title="Nothing to report"
            body="No friendly fire recorded across any loaded campaign. Genuinely impressive, or a very short session."
          />
        </div>
      ) : (
        <section className="py-10">
          <SectionHead label="Damage between teammates" />
          <FfMatrixView
            allTime={allTime}
            perCampaign={perCampaign}
            options={options}
          />
        </section>
      )}
    </main>
  );
}
