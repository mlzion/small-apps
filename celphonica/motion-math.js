// DeviceOrientation uses intrinsic Z-X-Y rotations. Quaternions avoid Euler
// wrap jumps when crossing +/-180 degrees or changing landscape hand position.
const radians = Math.PI / 180;
function multiply(a, b) {
  const [w, x, y, z] = a, [v, i, j, k] = b;
  return [w*v-x*i-y*j-z*k, w*i+x*v+y*k-z*j, w*j-x*k+y*v+z*i, w*k+x*j-y*i+z*v];
}
export function orientationQuaternion(alpha, beta, gamma) {
  const a = (Number.isFinite(alpha) ? alpha : 0) * radians / 2;
  const b = beta * radians / 2, g = gamma * radians / 2;
  return multiply(multiply([Math.cos(a), 0, 0, Math.sin(a)],
    [Math.cos(b), Math.sin(b), 0, 0]), [Math.cos(g), 0, Math.sin(g), 0]);
}
export function relativeTilt(reference, current, angle = 0) {
  let q = multiply([reference[0], -reference[1], -reference[2], -reference[3]], current);
  if (q[0] < 0) q = q.map(value => -value); // shortest rotation, not a full turn
  const magnitude = Math.hypot(q[1], q[2], q[3]);
  const factor = magnitude < 1e-9 ? 0 : 2 * Math.atan2(magnitude, Math.max(0, q[0])) / magnitude / radians;
  const x = q[2] * factor, y = q[1] * factor;
  const theta = angle * radians;
  return { x: x * Math.cos(theta) + y * Math.sin(theta), y: -x * Math.sin(theta) + y * Math.cos(theta) };
}
export function clampCircle(x, y) {
  const divisor = Math.max(1, Math.hypot(x, y));
  return { x: x / divisor, y: y / divisor };
}
export class MotionModel {
  constructor() { this.sensitivity = 1; this.reset(); }
  reset() { this.current = null; this.reference = null; this.time = null; this.x = 0; this.y = 0; }
  recenter() { this.reference = this.current; this.x = 0; this.y = 0; this.time = null; }
  sample(quaternion, time, screenAngle) {
    this.current = quaternion;
    if (!this.reference) this.recenter();
    const delta = relativeTilt(this.reference, quaternion, screenAngle);
    const target = clampCircle(delta.x * this.sensitivity / 25, delta.y * this.sensitivity / 25);
    // Time-based 45 ms lowpass: identical feel at different sensor rates.
    const dt = this.time === null ? 16 : Math.max(0, time - this.time);
    const blend = 1 - Math.exp(-dt / 45);
    this.x += (target.x - this.x) * blend;
    this.y += (target.y - this.y) * blend;
    this.time = time;
    return { x: this.x, y: this.y };
  }
}
