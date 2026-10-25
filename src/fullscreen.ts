export function fullscreenAvailable(): boolean {
  return !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
}

export function toggleFullscreen(): void {
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  } catch {
    /* not allowed here */
  }
}
