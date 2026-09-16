"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildStore, mergeStores, type StatsStore } from "@/lib/store";
import {
  clearStoredUploads,
  loadStoredUploads,
  mergeUploads,
  parseUploads,
  readDroppedFiles,
  saveStoredUploads,
  type StoredUpload,
} from "@/lib/uploads";
import { campaignLabel, formatDuration } from "@/lib/metrics";
import { DedupeNotice, FailureNotice, SectionHead } from "./ui";

/**
 * Both input paths, side by side, with what each one actually produced.
 *
 * The dropzone keeps raw file text in localStorage and re-parses on load, so
 * a cache written by an older build can never poison a newer one.
 */
export default function LoadPanel({
  dir,
  configured,
  isDefault,
  missing,
  dirError,
  filesRead,
  fsStore,
}: {
  dir: string;
  configured: string;
  isDefault: boolean;
  missing: boolean;
  dirError?: string;
  filesRead: string[];
  fsStore: StatsStore;
}) {
  const [uploads, setUploads] = useState<StoredUpload[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [persistFailed, setPersistFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUploads(loadStoredUploads());
    setHydrated(true);
  }, []);

  const uploadStore = useMemo(
    () => buildStore(parseUploads(uploads)),
    [uploads],
  );
  const merged = useMemo(
    () => (uploads.length === 0 ? fsStore : mergeStores(fsStore, uploadStore)),
    [fsStore, uploadStore, uploads.length],
  );

  async function ingest(list: FileList | null) {
    if (!list) return;
    const incoming = await readDroppedFiles(Array.from(list));
    if (incoming.length === 0) return;
    setUploads((prev) => {
      const next = mergeUploads(prev, incoming);
      setPersistFailed(!saveStoredUploads(next));
      return next;
    });
  }

  return (
    <div className="space-y-12 py-10">
      {/* Folder source */}
      <section>
        <SectionHead
          label="Game folder"
          note={`${filesRead.length} file${filesRead.length === 1 ? "" : "s"} found`}
        />
        <div className="panel min-w-0 px-5 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="eyebrow">PSTATS_DIR</span>
            <span className="mono text-[0.8rem] text-ink">{configured}</span>
            {isDefault && (
              <span className="eyebrow text-ink-faint">(default)</span>
            )}
          </div>
          <div className="mono mt-2 break-all text-[0.72rem] text-ink-faint">
            {dir}
          </div>

          {missing && !dirError && (
            <div className="mt-4 border-t border-rule pt-4">
              <p className="text-[0.82rem] text-ink-dim">
                That folder does not exist yet. Symlink your game folder once
                and every refresh picks up the latest run:
              </p>
              <pre className="scroll-slim mono mt-3 max-w-full overflow-x-auto bg-sunken px-3 py-2.5 text-[0.72rem] text-ink-mute">
                ln -s &quot;/path/to/Left 4 Dead 2/left4dead2/ems/pstats&quot;
                ./data
              </pre>
              <p className="mt-3 text-[0.75rem] text-ink-mute">
                On Windows, run{" "}
                <span className="mono">
                  mklink /D data &quot;C:\...\left4dead2\ems\pstats&quot;
                </span>{" "}
                from an elevated prompt, or set PSTATS_DIR in{" "}
                <span className="mono">.env.local</span> to the folder itself.
              </p>
            </div>
          )}

          {dirError && (
            <p className="mt-4 border-t border-harm-dim pt-4 text-[0.82rem] text-harm">
              {dirError}
            </p>
          )}

          {filesRead.length > 0 && (
            <ul className="mono mt-4 space-y-1 border-t border-rule pt-4 text-[0.72rem] text-ink-mute">
              {filesRead.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Dropzone */}
      <section>
        <SectionHead
          label="Dropped files"
          note={
            hydrated && uploads.length > 0
              ? `${uploads.length} kept in this browser`
              : "For files from another machine"
          }
        />

        <button
          type="button"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void ingest(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`w-full border border-dashed px-8 py-12 text-center transition-colors ${
            dragging
              ? "border-clear bg-clear/[0.04]"
              : "border-rule-bright hover:border-ink-faint"
          }`}
        >
          <div className="display text-[1.1rem] text-ink-dim">
            Drop stats files here
          </div>
          <p className="mx-auto mt-2 max-w-sm text-[0.8rem] text-ink-mute">
            Any number of <span className="mono">.json</span> files written by
            the tracker. They stay in this browser and never leave the
            machine.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            multiple
            hidden
            onChange={(e) => void ingest(e.target.files)}
          />
        </button>

        {hydrated && uploads.length > 0 && (
          <div className="mt-4 flex items-start justify-between gap-6">
            <ul className="mono space-y-1 text-[0.72rem] text-ink-mute">
              {uploads.map((u) => (
                <li key={u.fileName}>{u.fileName}</li>
              ))}
            </ul>
            <button
              onClick={() => {
                clearStoredUploads();
                setUploads([]);
                setPersistFailed(false);
              }}
              className="eyebrow shrink-0 transition-colors hover:text-harm"
            >
              Remove all
            </button>
          </div>
        )}

        {persistFailed && (
          <p className="mt-3 text-[0.78rem] text-harm">
            These files could not be saved to this browser, so they will be
            gone on refresh. Storage may be full or blocked.
          </p>
        )}
      </section>

      {/* What was loaded */}
      <section>
        <SectionHead
          label="Loaded"
          note={`${merged.sessions.length} campaign${merged.sessions.length === 1 ? "" : "s"}`}
        />

        <div className="space-y-4">
          {merged.failures.length > 0 && (
            <FailureNotice failures={merged.failures} />
          )}
          {merged.dropped.length > 0 && (
            <DedupeNotice dropped={merged.dropped} />
          )}
        </div>

        {merged.sessions.length === 0 ? (
          <p className="py-8 text-[0.85rem] text-ink-mute">
            Nothing loaded yet.
          </p>
        ) : (
          <div className="scroll-slim mt-4 min-w-0 overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Campaign</th>
                <th scope="col">Session</th>
                <th scope="col">Source</th>
                <th scope="col">Chapters</th>
                <th scope="col">Time</th>
                <th scope="col">Saves</th>
              </tr>
            </thead>
            <tbody>
              {merged.sessions.map((s) => (
                <tr key={s.sessionId}>
                  <td>{campaignLabel(s.campaign, s.official)}</td>
                  <td className="mono text-[0.72rem] text-ink-mute">
                    {s.sessionId}
                  </td>
                  <td>
                    <span className="mono text-[0.72rem] text-ink-mute">
                      {s.source.fileName}
                    </span>
                  </td>
                  <td>{s.chapters.length}</td>
                  <td>{formatDuration(s.playtimeS)}</td>
                  <td className="text-ink-mute">{s.saves}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
