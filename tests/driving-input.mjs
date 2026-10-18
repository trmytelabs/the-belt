/** Synthetic driver decisions; the browser helper sends these as real keys. */
export function drivingInput(drive, aheadHeading, roadHeading) {
  const delta = Math.atan2(Math.sin(aheadHeading - roadHeading), Math.cos(aheadHeading - roadHeading));
  const steer = Math.max(-1, Math.min(1, (-drive.headingError * 3 - (drive.offset - 2.6) * 0.5 - delta / 2 * drive.speed * 0.65) / 1.4));
  const signal = drive.signal;
  const stop = signal && signal.color !== 'green' && signal.remaining > 0 && signal.remaining < drive.speed * drive.speed / 28 + 2;
  return { steer, throttle: stop ? 0 : 1, brake: stop ? 1 : 0 };
}
