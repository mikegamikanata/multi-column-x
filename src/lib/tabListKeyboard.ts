export type TabListOrientation = "horizontal" | "vertical";

/**
 * タブ列でキー入力されたときの移動先インデックスを返す。移動しないキーなら null。
 * 端では反対側へ折り返す。Home / End は先頭 / 末尾。
 */
export function nextTabIndex(
  count: number,
  current: number,
  key: string,
  orientation: TabListOrientation,
): number | null {
  if (count <= 0) return null;
  const prev = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
  const next = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
  switch (key) {
    case prev:
      return (current - 1 + count) % count;
    case next:
      return (current + 1) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
