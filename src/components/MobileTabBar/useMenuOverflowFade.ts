import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getMenuFadeState } from "@/lib/menuOverflowFade";
import type { MenuFadeState } from "@/lib/menuOverflowFade";
import { rafThrottle } from "@/lib/rafThrottle";

const NO_FADE: MenuFadeState = { start: false, end: false };

/**
 * 横スクロールするメニューの「隠れている側」を追跡し、展開時に末尾までスクロールする。
 *
 * - expanded が変わったとき: 展開なら末尾へ、折りたたみなら先頭へスクロールする
 * - rescanKey が変わったとき: スクロール位置は触らず、フェードの表示判定だけやり直す
 */
export function useMenuOverflowFade(expanded: boolean, rescanKey: unknown) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState<MenuFadeState>(NO_FADE);

  const update = useCallback(() => {
    const el = menuRef.current;
    if (!el) return;
    const next = getMenuFadeState({
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    });
    setFade((prev) =>
      prev.start === next.start && prev.end === next.end ? prev : next,
    );
  }, []);

  const onScroll = useMemo(() => rafThrottle(update), [update]);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (el) el.scrollLeft = expanded ? el.scrollWidth : 0;
    update();
  }, [expanded, update]);

  useLayoutEffect(() => {
    update();
  }, [rescanKey, update]);

  useEffect(() => {
    const el = menuRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [update]);

  useEffect(() => () => onScroll.cancel(), [onScroll]);

  return { menuRef, fade, onScroll };
}
