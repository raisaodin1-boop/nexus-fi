import { Platform, useWindowDimensions } from "react-native";

/** Minimum touch target (Apple HIG / Material). */
export const MIN_TOUCH = 44;

export const APP_MAX_WIDTH = 480;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isCompact = width < 380;
  const isMobile = width < 768;
  const horizontalPad = isCompact ? 16 : 20;

  return {
    width,
    height,
    isCompact,
    isMobile,
    horizontalPad,
    minTouch: MIN_TOUCH,
    /** Slightly smaller display type on narrow screens. */
    titleSize: isCompact ? 20 : 22,
    heroSize: isCompact ? 34 : 42,
  };
}

/** Root web frame — phone column centered on tablet/desktop. */
export function webAppFrameStyle() {
  if (Platform.OS !== "web") return undefined;
  return {
    flex: 1,
    width: "100%" as const,
    maxWidth: APP_MAX_WIDTH,
    alignSelf: "center" as const,
  };
}
