/** Runtime + build-time public env (web PWA reads window.__HODIX_ENV__ first). */
declare global {
  interface Window {
    __HODIX_ENV__?: Record<string, string>;
  }
}

export function publicEnv(name: string): string {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  if (typeof window !== "undefined") {
    const fromRuntime = window.__HODIX_ENV__?.[name]?.trim();
    if (fromRuntime) return fromRuntime;
  }
  return "";
}
