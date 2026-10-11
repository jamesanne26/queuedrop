/** Call directly from a user click; browsers may refuse fullscreen. */
export async function enterTvFullscreen(): Promise<boolean> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    return Boolean(document.fullscreenElement);
  } catch { return false; }
}
export async function exitTvFullscreen(): Promise<void> {
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* Navigation still works. */ }
}
