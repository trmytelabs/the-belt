import { cityRoute, roundedRoute, separation, angleDelta } from '../src/three/drivingCity.ts';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** Decisions for a synthetic driver. Production movement never uses this route. */
export function makeDriver(start, goal, via) {
  const centre = roundedRoute(via ?? cityRoute(start, goal, start.heading));
  const path = centre.map((p, i) => {
    const a = centre[Math.max(0, i - 1)], b = centre[Math.min(centre.length - 1, i + 1)];
    const length = separation(a, b) || 1, weight = Math.min(1, i / 5, (centre.length - i - 1) / 5);
    return { x: p.x - (b.z - a.z) / length * 2.6 * weight, z: p.z + (b.x - a.x) / length * 2.6 * weight };
  });
  let index = 0;
  return d => {
    let nearest = Infinity;
    for (let i = index; i < Math.min(path.length, index + 45); i++) {
      const distance = separation(d, path[i]);
      if (distance < nearest) { nearest = distance; index = i; }
    }
    let target = index, ahead = 0;
    const look = Math.max(7, Math.abs(d.speed) * 0.65);
    while (target < path.length - 1 && ahead < look) { ahead += separation(path[target], path[target + 1]); target++; }
    const heading = Math.atan2(-(path[target].z - d.z), path[target].x - d.x), error = angleDelta(heading - d.heading);
    const steer = clamp(-error * 2.8, -1, 1);
    const next = Math.min(path.length - 1, index + 16), after = Math.min(path.length - 1, next + 8);
    const future = Math.atan2(-(path[after].z - path[next].z), path[after].x - path[next].x);
    const bend = Math.abs(angleDelta(future - d.heading));
    const targetSpeed = bend > 0.25 || Math.abs(error) > 0.3 ? 10.5 : 18;
    const signal = d.signal;
    const red = signal && signal.color !== 'green' && signal.remaining > -0.1 && signal.remaining < d.speed * d.speed / 32 + 2;
    const parking = separation(d, goal) < Math.max(4.5, d.speed * d.speed / 32 + 3.2);
    const stop = red || parking;
    return { steer, throttle: stop || d.speed > targetSpeed + 0.3 ? 0 : 1, brake: stop ? d.speed > 0.1 ? 1 : 0 : d.speed > targetSpeed + 0.7 ? 1 : 0 };
  };
}

export function driverState(m) {
  const signal = m.nextSignal;
  return { x: m.x, z: m.z, heading: m.heading, speed: m.speed, canPark: m.canPark,
    signal: signal ? { color: m.signalColor(signal), remaining: m.signalDistance(signal) } : null };
}
