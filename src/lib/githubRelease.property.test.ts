import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  WHATS_NEW_MAX_ENTRIES,
  parseDigestSha256,
  selectWhatsNewEntries,
} from "./githubRelease";
import { isNewerVersion } from "./version";

describe("parseDigestSha256 プロパティ", () => {
  it("戻り値が非nullなら常に小文字64桁hexである", () => {
    fc.assert(
      fc.property(fc.string(), (digest) => {
        const result = parseDigestSha256(digest);
        if (result !== null) {
          expect(result).toMatch(/^[0-9a-f]{64}$/);
        }
      }),
    );
  });

  it("sha256:に有効な64桁hex(大小混在)を付けると元hexの小文字を返す", () => {
    const hexCharArb = fc.constantFrom(..."0123456789abcdefABCDEF".split(""));
    fc.assert(
      fc.property(
        fc.array(hexCharArb, { minLength: 64, maxLength: 64 }),
        (hexChars) => {
          const hex = hexChars.join("");
          const input = `sha256:${hex}`;
          expect(parseDigestSha256(input)).toBe(hex.toLowerCase());
        },
      ),
    );
  });
});

interface GeneratedRelease {
  tag_name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
}

const versionArb = fc
  .tuple(
    fc.integer({ min: 0, max: 3 }),
    fc.integer({ min: 0, max: 3 }),
    fc.integer({ min: 0, max: 3 }),
  )
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

const releaseArb: fc.Arbitrary<GeneratedRelease> = fc.record({
  tag_name: fc
    .tuple(fc.constantFrom("v", "V", ""), versionArb)
    .map(([prefix, version]) => `${prefix}${version}`),
  body: fc.oneof(
    fc.constant(""),
    fc.constantFrom(" ", "\n", " \t\n "),
    fc.string({ minLength: 1 }).map((text) => `本文${text}`),
  ),
  draft: fc.boolean(),
  prerelease: fc.boolean(),
});

const releasesArb = fc.array(releaseArb, { maxLength: 12 });

function stripV(tag: string): string {
  return tag.replace(/^v/i, "");
}

function isEligible(r: GeneratedRelease, lastSeen: string, current: string) {
  const version = stripV(r.tag_name);
  return (
    !r.draft &&
    !r.prerelease &&
    r.body.trim() !== "" &&
    isNewerVersion(version, lastSeen) &&
    !isNewerVersion(version, current)
  );
}

describe("selectWhatsNewEntries プロパティ", () => {
  it("entriesは最大件数を超えない", () => {
    fc.assert(
      fc.property(releasesArb, versionArb, versionArb, (json, last, cur) => {
        const { entries } = selectWhatsNewEntries(json, last, cur);
        expect(entries.length).toBeLessThanOrEqual(WHATS_NEW_MAX_ENTRIES);
      }),
    );
  });

  it("entriesはバージョン降順に並ぶ", () => {
    fc.assert(
      fc.property(releasesArb, versionArb, versionArb, (json, last, cur) => {
        const { entries } = selectWhatsNewEntries(json, last, cur);
        for (let i = 1; i < entries.length; i++) {
          // 隣接が昇順(後ろの方が新しい)になっていないこと
          expect(
            isNewerVersion(entries[i].version, entries[i - 1].version),
          ).toBe(false);
        }
      }),
    );
  });

  it("全てのversionは前回より新しく今回以下である", () => {
    fc.assert(
      fc.property(releasesArb, versionArb, versionArb, (json, last, cur) => {
        const { entries } = selectWhatsNewEntries(json, last, cur);
        for (const e of entries) {
          expect(isNewerVersion(e.version, last)).toBe(true);
          expect(isNewerVersion(e.version, cur)).toBe(false);
        }
      }),
    );
  });

  it("下書き・プレリリース・本文が空白のみのリリースは含まれない", () => {
    fc.assert(
      fc.property(releasesArb, versionArb, versionArb, (json, last, cur) => {
        const { entries } = selectWhatsNewEntries(json, last, cur);
        const excludedVersions = new Set(
          json
            .filter((r) => r.draft || r.prerelease || r.body.trim() === "")
            .map((r) => stripV(r.tag_name)),
        );
        const includedOkVersions = new Set(
          json
            .filter((r) => !r.draft && !r.prerelease && r.body.trim() !== "")
            .map((r) => stripV(r.tag_name)),
        );
        for (const e of entries) {
          // 同じバージョンの適格なリリースが別にある場合を除き、除外対象は現れない
          if (excludedVersions.has(e.version)) {
            expect(includedOkVersions.has(e.version)).toBe(true);
          }
          expect(e.notes.trim()).not.toBe("");
        }
      }),
    );
  });

  it("hasMoreは適格件数が最大件数を超えるときだけtrueになる", () => {
    fc.assert(
      fc.property(releasesArb, versionArb, versionArb, (json, last, cur) => {
        const eligibleCount = json.filter((r) =>
          isEligible(r, last, cur),
        ).length;
        const { entries, hasMore } = selectWhatsNewEntries(json, last, cur);
        expect(hasMore).toBe(eligibleCount > WHATS_NEW_MAX_ENTRIES);
        expect(entries.length).toBe(
          Math.min(eligibleCount, WHATS_NEW_MAX_ENTRIES),
        );
      }),
    );
  });

  it("入力配列の順序を並べ替えても結果のバージョンと件数は変わらない", () => {
    fc.assert(
      fc.property(
        releasesArb,
        versionArb,
        versionArb,
        fc.infiniteStream(fc.nat()),
        (json, last, cur, stream) => {
          const shuffled = [...json];
          const it = stream[Symbol.iterator]();
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = it.next().value % (i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          const a = selectWhatsNewEntries(json, last, cur);
          const b = selectWhatsNewEntries(shuffled, last, cur);
          expect(b.entries.map((e) => e.version)).toEqual(
            a.entries.map((e) => e.version),
          );
          expect(b.hasMore).toBe(a.hasMore);
        },
      ),
    );
  });
});
