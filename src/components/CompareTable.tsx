import { leadOf, type CompareGroup, type CompareRow } from "@/lib/compare";

/**
 * The side-by-side ledger.
 *
 * The lead is marked structurally, not chromatically. The house rule is that
 * colour is rationed to harm and clear and never keyed to player identity,
 * so the winning side gets a pointer and full-strength ink while the other
 * recedes -- the same device `rowFocus` uses. Which side leads is decided in
 * `lib/compare.ts`, not here.
 */

export default function CompareTable({
  groups,
  labelA,
  labelB,
}: {
  groups: CompareGroup[];
  labelA: string;
  labelB: string;
}) {
  return (
    <div className="scroll-slim min-w-0 overflow-x-auto">
      <table className="data-table w-full">
        <caption className="sr-only">
          {labelA} and {labelB} compared across every recorded run. The leading
          side of each row is marked.
        </caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">{labelA}</th>
            <th scope="col">{labelB}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.label} group={g} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ group }: { group: CompareGroup }) {
  return (
    <>
      {/* A group heading inside the table body rather than a table per
          group: the two columns have to stay in one vertical line down the
          whole page, and separate tables would each size their own. */}
      <tr>
        <th
          scope="colgroup"
          colSpan={3}
          className="eyebrow !pt-6 !pb-1.5 !text-left !text-ink-mute"
        >
          {group.label}
        </th>
      </tr>
      {group.rows.map((r) => {
        const lead = leadOf(r);
        return (
          <tr key={r.label}>
            <td className="text-ink-dim" title={r.title}>
              {r.label}
            </td>
            <Cell value={r.a} sub={r.aSub} lead={lead === "a"} faded={lead === "b"} side="a" />
            <Cell value={r.b} sub={r.bSub} lead={lead === "b"} faded={lead === "a"} side="b" />
          </tr>
        );
      })}
    </>
  );
}

function Cell({
  value,
  sub,
  lead,
  faded,
  side,
}: {
  value: string;
  sub?: string;
  lead: boolean;
  faded: boolean;
  side: "a" | "b";
}) {
  return (
    <td className={lead ? "text-ink" : faded ? "text-ink-mute" : "text-ink-dim"}>
      <span className="inline-flex items-baseline gap-1.5">
        {/* The marker points across at the other column, so the eye is led
            from the number to the comparison rather than off the edge. */}
        {lead && side === "b" && (
          <span aria-hidden className="text-ink-faint">
            ◂
          </span>
        )}
        <span className={lead ? "font-medium" : ""}>{value}</span>
        {lead && (
          <span className="sr-only">(leads)</span>
        )}
        {lead && side === "a" && (
          <span aria-hidden className="text-ink-faint">
            ▸
          </span>
        )}
      </span>
      {sub && (
        <div className="mono mt-0.5 text-[0.62rem] leading-tight text-ink-faint">
          {sub}
        </div>
      )}
    </td>
  );
}
