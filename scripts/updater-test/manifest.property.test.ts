import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareVersions, resolveArtifactPath } from "./manifest.mjs";

const ROOT = path.resolve("artifacts-root");

/** 危険になりやすい断片を混ぜたファイル名候補 */
const fileNameArb = fc.oneof(
  fc.string(),
  fc.constantFrom(
    "..",
    ".",
    "",
    "a/b",
    "a\\b",
    "../x",
    "..\\x",
    "C:foo",
    "/etc/passwd",
  ),
  fc
    .array(
      fc.constantFrom("a", "b", ".", "..", "/", "\\", "\0", "x.exe", ":"),
      { maxLength: 6 },
    )
    .map((parts) => parts.join("")),
);

const versionTupleArb = fc.tuple(fc.nat(1000), fc.nat(1000), fc.nat(1000));
/** 各成分が衝突しやすい小さな範囲（桁ごとの比較を確実に踏ませる） */
const smallTupleArb = fc.tuple(fc.nat(2), fc.nat(2), fc.nat(2));
const versionArb = versionTupleArb.chain(([a, b, c]) =>
  fc.constantFrom(`${a}.${b}.${c}`, `v${a}.${b}.${c}`),
);

describe("resolveArtifactPath プロパティ", () => {
  it("null でない結果は常に成果物ディレクトリ直下のパスである", () => {
    fc.assert(
      fc.property(fileNameArb, (name) => {
        const result = resolveArtifactPath(ROOT, name);
        if (result !== null) {
          expect(path.dirname(result)).toBe(ROOT);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("パス区切りまたは NUL を含む名前は常に null になる", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom("/", "\\", "\0"),
        fc.string(),
        (head, sep, tail) => {
          expect(resolveArtifactPath(ROOT, `${head}${sep}${tail}`)).toBeNull();
        },
      ),
    );
  });

  it("親ディレクトリ参照を含む名前は常に null になる", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (head, tail) => {
        expect(resolveArtifactPath(ROOT, `${head}/../${tail}`)).toBeNull();
        expect(resolveArtifactPath(ROOT, `${head}\\..\\${tail}`)).toBeNull();
      }),
    );
  });
});

describe("compareVersions プロパティ", () => {
  it("結果は常に -1 / 0 / 1 のいずれかである", () => {
    fc.assert(
      fc.property(versionArb, versionArb, (a, b) => {
        expect([-1, 0, 1]).toContain(compareVersions(a, b));
      }),
    );
  });

  it("反対称: compare(a,b) は -compare(b,a) に等しい", () => {
    fc.assert(
      fc.property(versionArb, versionArb, (a, b) => {
        expect(compareVersions(a, b)).toBe(-compareVersions(b, a) || 0);
      }),
    );
  });

  it("反射: 同一バージョン同士は 0 になる", () => {
    fc.assert(
      fc.property(versionArb, (a) => {
        expect(compareVersions(a, a)).toBe(0);
      }),
    );
  });

  it("v 接頭辞の有無で比較結果が変わらない", () => {
    fc.assert(
      fc.property(versionTupleArb, versionTupleArb, (x, y) => {
        const a = x.join(".");
        const b = y.join(".");
        expect(compareVersions(`v${a}`, b)).toBe(compareVersions(a, b));
      }),
    );
  });

  it("結果は 3 要素の辞書順比較と一致する", () => {
    fc.assert(
      fc.property(smallTupleArb, smallTupleArb, (x, y) => {
        const expected = (() => {
          for (let i = 0; i < 3; i++) {
            if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
          }
          return 0;
        })();
        expect(compareVersions(x.join("."), y.join("."))).toBe(expected);
      }),
    );
  });

  it("推移: a<=b かつ b<=c ならば a<=c", () => {
    fc.assert(
      fc.property(versionArb, versionArb, versionArb, (a, b, c) => {
        fc.pre(compareVersions(a, b) <= 0 && compareVersions(b, c) <= 0);
        expect(compareVersions(a, c)).toBeLessThanOrEqual(0);
      }),
      { numRuns: 500 },
    );
  });
});
