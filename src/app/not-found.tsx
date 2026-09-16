import Link from "next/link";
import { Empty } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-[1400px] px-6 py-20">
      <Empty
        title="Nothing here"
        body="That campaign or player is not in the loaded files. It may be in a file that has not been loaded yet."
        action={
          <Link
            href="/"
            className="eyebrow border border-rule-bright px-4 py-2 text-ink-dim transition-colors hover:border-ink-faint hover:text-ink"
          >
            Back to overview
          </Link>
        }
      />
    </main>
  );
}
