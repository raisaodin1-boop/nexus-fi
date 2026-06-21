import { Platform, useWindowDimensions } from "react-native";

/** Minimum touch target (Apple HIG / Material). */
export const MIN_TOUCH = 44;

export const APP_MAX_WIDTH = 480;

/** Phone-frame preview only on wide viewports (desktop). Real phones use full width. */
export const WEB_FRAME_MIN_WIDTH = 768;

export function shouldShowWebPhoneFrame(width: number): boolean {
  if (Platform.OS !== "web" || width < WEB_FRAME_MIN_WIDTH) return false;
  // Touch devices (phones/tablets) always use full width, even in landscape.
  if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
    return false;
  }
  return true;
}

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isCompact = width < 380;
  const isNarrow = width < 420;
  const isMobile = width < 768;
  const horizontalPad = isCompact ? 16 : 20;

  return {
    width,
    height,
    isCompact,
    isNarrow,
    isMobile,
    horizontalPad,
    minTouch: MIN_TOUCH,
    /** Slightly smaller display type on narrow screens. */
    titleSize: isCompact ? 20 : 22,
    heroSize: isCompact ? 34 : 42,
  };
}

/** Root web frame — phone column centered on desktop only. */
export function webAppFrameStyle(width: number) {
  if (!shouldShowWebPhoneFrame(width)) return undefined;
  return {
    flex: 1,
    width: "100%" as const,
    maxWidth: APP_MAX_WIDTH,
    alignSelf: "center" as const,
  };
}
