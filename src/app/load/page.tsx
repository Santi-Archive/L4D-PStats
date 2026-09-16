import { getReport, pstatsDir } from "@/lib/data.server";
import LoadPanel from "@/components/LoadPanel";
import { PSTATS_DIR_DEFAULT } from "@/lib/loader.server";

export const dynamic = "force-dynamic";

export default async function LoadPage() {
  const report = await getReport();

  return (
    <main className="mx-auto w-full max-w-[1000px] px-6 pb-24">
      <header className="rise border-b border-rule py-10">
        <div className="eyebrow mb-3">Data sources</div>
        <h1 className="display text-[clamp(2.2rem,5vw,3.4rem)] text-ink">
          Load stats files
        </h1>
        <p className="mt-4 max-w-xl text-[0.88rem] leading-relaxed text-ink-mute">
          PSTATS reads a folder on this machine and, if you want, files you
          drop in by hand. Both feed the same views.
        </p>
      </header>

      <LoadPanel
        dir={report.dir}
        configured={pstatsDir()}
        isDefault={pstatsDir() === PSTATS_DIR_DEFAULT}
        missing={report.missing}
        dirError={report.dirError}
        filesRead={report.filesRead}
        fsStore={report.store}
      />
    </main>
  );
}
