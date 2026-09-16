import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadFromDisk } from "@/lib/loader.server";
import { SAMPLE_DIR, SAMPLES, readSampleJson, readSampleText } from "./fixtures";
import {
  mergeUploads,
  parseUploads,
  storeFromUploads,
  type StoredUpload,
} from "@/lib/uploads";

async function scratch(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pstats-test-"));
}

describe("filesystem loader", () => {
  it("reads the sample directory", async () => {
    const report = await loadFromDisk(SAMPLE_DIR);
    expect(report.missing).toBe(false);
    expect(report.dirError).toBeUndefined();
    expect(report.filesRead).toHaveLength(4);
    expect(report.store.sessions).toHaveLength(4);
    expect(report.store.failures).toEqual([]);
  });

  it("reads _current.json last so archives land first", async () => {
    const report = await loadFromDisk(SAMPLE_DIR);
    expect(report.filesRead[report.filesRead.length - 1]).toBe("_current.json");
  });

  it("treats a missing directory as an empty state, not an error", async () => {
    const dir = path.join(await scratch(), "does-not-exist");
    const report = await loadFromDisk(dir);
    expect(report.missing).toBe(true);
    expect(report.dirError).toBeUndefined();
    expect(report.store.sessions).toEqual([]);
  });

  it("ignores non-json files", async () => {
    const dir = await scratch();
    await writeFile(path.join(dir, "readme.txt"), "not stats");
    await writeFile(path.join(dir, "notes.md"), "# notes");
    await writeFile(
      path.join(dir, "one.json"),
      readSampleText(SAMPLES.c1),
      "utf8",
    );
    const report = await loadFromDisk(dir);
    expect(report.filesRead).toEqual(["one.json"]);
    expect(report.store.sessions).toHaveLength(1);
  });

  it("keeps going when one file in the directory is corrupt", async () => {
    const dir = await scratch();
    await writeFile(path.join(dir, "good.json"), readSampleText(SAMPLES.c1));
    await writeFile(path.join(dir, "truncated.json"), '{"schema":1,"chap');
    await writeFile(path.join(dir, "wrong.json"), '{"unrelated":true}');

    const report = await loadFromDisk(dir);
    expect(report.store.sessions).toHaveLength(1);
    expect(report.store.failures).toHaveLength(2);
    const names = report.store.failures.map((f) => f.fileName).sort();
    expect(names).toEqual(["truncated.json", "wrong.json"]);
    // Every failure carries something a human can read.
    for (const f of report.store.failures) {
      expect(f.error.length).toBeGreaterThan(0);
    }
  });

  it("dedupes a real archive/_current collision on disk", async () => {
    const dir = await scratch();
    const base = readSampleJson(SAMPLES.c1) as any;

    const archive = structuredClone(base);
    archive.saves = 88;
    await writeFile(
      path.join(dir, "2026-09-12_1747-0002_c1_coop.json"),
      JSON.stringify(archive),
    );

    // _current still holds the same session, saved more times since.
    const current = structuredClone(base);
    current.saves = 131;
    current.updated_utc = base.updated_utc + 60;
    await writeFile(path.join(dir, "_current.json"), JSON.stringify(current));

    const report = await loadFromDisk(dir);
    expect(report.filesRead).toHaveLength(2);
    expect(report.store.sessions).toHaveLength(1);
    expect(report.store.sessions[0]!.saves).toBe(131);
    expect(report.store.sessions[0]!.source.fileName).toBe("_current.json");
    expect(report.store.dropped).toHaveLength(1);
  });

  it("returns an error when the path is a file, not a directory", async () => {
    const dir = await scratch();
    const file = path.join(dir, "afile.json");
    await writeFile(file, "{}");
    const report = await loadFromDisk(file);
    expect(report.missing).toBe(true);
    expect(report.dirError).toMatch(/not a directory/);
  });

  it("handles an empty directory", async () => {
    const dir = path.join(await scratch(), "empty");
    await mkdir(dir);
    const report = await loadFromDisk(dir);
    expect(report.missing).toBe(false);
    expect(report.filesRead).toEqual([]);
    expect(report.store.sessions).toEqual([]);
  });
});

describe("upload path", () => {
  function upload(fileName: string, text: string): StoredUpload {
    return { fileName, text, addedAt: 0 };
  }

  it("parses dropped files into the same normalized store", async () => {
    const uploads = [
      upload(SAMPLES.c1, readSampleText(SAMPLES.c1)),
      upload(SAMPLES.custom, readSampleText(SAMPLES.custom)),
    ];
    const store = storeFromUploads(uploads);
    expect(store.sessions).toHaveLength(2);
    expect(store.sessions.every((s) => s.source.origin === "upload")).toBe(true);
  });

  it("produces a store indistinguishable from the fs path", async () => {
    // PLAN.md section 3: nothing downstream should know which path was used.
    const fsReport = await loadFromDisk(SAMPLE_DIR);
    const uploadStore = storeFromUploads(
      Object.values(SAMPLES).map((f) => upload(f, readSampleText(f))),
    );

    const strip = (s: { sessionId: string; totals: { key: string }[] }) => ({
      id: s.sessionId,
      keys: s.totals.map((p) => p.key).sort(),
    });
    expect(uploadStore.sessions.map(strip)).toEqual(
      fsReport.store.sessions.map(strip),
    );
  });

  it("reports a bad uploaded file rather than dropping it silently", () => {
    const store = storeFromUploads([upload("bad.json", "{{{")]);
    expect(store.sessions).toEqual([]);
    expect(store.failures).toHaveLength(1);
    expect(store.failures[0]!.origin).toBe("upload");
  });

  it("replaces an earlier upload with the same file name", () => {
    const a = upload("x.json", readSampleText(SAMPLES.c1));
    const b = upload("x.json", readSampleText(SAMPLES.c2));
    const merged = mergeUploads([a], [b]);
    expect(merged).toHaveLength(1);
    expect(parseUploads(merged)[0]).toMatchObject({ ok: true });
    const store = storeFromUploads(merged);
    expect(store.sessions[0]!.campaign).toBe("c2");
  });

  it("keeps uploads with different file names", () => {
    const merged = mergeUploads(
      [upload("a.json", readSampleText(SAMPLES.c1))],
      [upload("b.json", readSampleText(SAMPLES.c2))],
    );
    expect(merged).toHaveLength(2);
  });
});
