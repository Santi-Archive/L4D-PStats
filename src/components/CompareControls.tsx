"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * The two player selectors.
 *
 * Selection lives in the URL rather than in component state, so a comparison
 * is a link: it can be bookmarked, shared, and reached from a player page
 * with the first slot already filled. That also keeps the page itself a
 * server component -- this control is the only client-side piece, and all it
 * does is rewrite the query string.
 */

export interface CompareOption {
  key: string;
  label: string;
  kind: "human" | "bot" | "unresolved";
  campaigns: number;
}

export default function CompareControls({
  options,
  a,
  b,
}: {
  options: CompareOption[];
  a: string | null;
  b: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function choose(slot: "a" | "b", value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "") next.delete(slot);
    else next.set(slot, value);
    // `scroll: false` because the picker sits at the top of the page: the
    // reader is already looking at it, and jumping the scroll on every
    // change makes swapping a name feel like a navigation.
    router.replace(`/compare?${next.toString()}`, { scroll: false });
  }

  function swap() {
    const next = new URLSearchParams(params.toString());
    if (a) next.set("b", a);
    else next.delete("b");
    if (b) next.set("a", b);
    else next.delete("a");
    router.replace(`/compare?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
      <Picker
        slot="a"
        label="Player one"
        value={a}
        // The same person on both sides compares a player to themselves,
        // which is a row of ties and no information. The opposite slot's
        // pick is withheld rather than silently swapped.
        options={options.filter((o) => o.key !== b)}
        onChange={choose}
      />

      <button
        onClick={swap}
        disabled={!a && !b}
        title="Swap sides"
        className="eyebrow mb-1.5 border border-rule px-3 py-2 text-ink-mute transition-colors hover:border-rule-bright hover:text-ink-dim disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span aria-hidden>⇄</span>
        <span className="sr-only">Swap the two players</span>
      </button>

      <Picker
        slot="b"
        label="Player two"
        value={b}
        options={options.filter((o) => o.key !== a)}
        onChange={choose}
      />
    </div>
  );
}

function Picker({
  slot,
  label,
  value,
  options,
  onChange,
}: {
  slot: "a" | "b";
  label: string;
  value: string | null;
  options: CompareOption[];
  onChange: (slot: "a" | "b", value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={`compare-${slot}`}
        className="eyebrow mb-1.5 block"
      >
        {label}
      </label>
      <select
        id={`compare-${slot}`}
        value={value ?? ""}
        onChange={(e) => onChange(slot, e.target.value)}
        className="min-w-[13rem] border border-rule bg-raised px-3 py-2 text-[0.85rem] text-ink transition-colors hover:border-rule-bright focus:border-rule-bright focus:outline-none"
      >
        <option value="">Choose a player…</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
            {o.kind === "bot" ? " (bot)" : ""} · {o.campaigns} camp
            {o.campaigns === 1 ? "" : "s"}
          </option>
        ))}
      </select>
    </div>
  );
}
