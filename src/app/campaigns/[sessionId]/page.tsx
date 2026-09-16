import { notFound } from "next/navigation";
import { getReport } from "@/lib/data.server";
import { campaignLabel, campaignMetrics } from "@/lib/metrics";
import CampaignDetail from "@/components/CampaignDetail";

export const dynamic = "force-dynamic";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const decoded = decodeURIComponent(sessionId);
  const { store } = await getReport();
  const session = store.byId[decoded];

  if (!session) notFound();

  return (
    <CampaignDetail
      session={session}
      metrics={campaignMetrics(session)}
      title={campaignLabel(session.campaign, session.official)}
    />
  );
}
