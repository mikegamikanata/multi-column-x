export type MenuFadeState = { start: boolean; end: boolean };

type MenuScrollMetrics = {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
};

// Android のサブピクセルスクロールで生じる誤差を吸収する許容量（px）
export const FADE_TOLERANCE_PX = 1;

// 横スクロールのメニューで、隠れているボタンがある側（start=左 / end=右）を判定する。
// モバイル UI は LTR のみのため RTL（scrollLeft が負になる）は考慮しない。
export function getMenuFadeState({
  scrollLeft,
  scrollWidth,
  clientWidth,
}: MenuScrollMetrics): MenuFadeState {
  if (scrollWidth - clientWidth <= FADE_TOLERANCE_PX) {
    return { start: false, end: false };
  }
  return {
    start: scrollLeft > FADE_TOLERANCE_PX,
    end: scrollLeft + clientWidth < scrollWidth - FADE_TOLERANCE_PX,
  };
}
