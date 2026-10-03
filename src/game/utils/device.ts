export function isMobileBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  const hasMobileUserAgent = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(userAgent);
  const hasTouch = navigator.maxTouchPoints > 1 || 'ontouchstart' in window;
  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;

  return hasMobileUserAgent || (hasTouch && hasCoarsePointer);
}
