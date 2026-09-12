// A rider's face inside a ring that fills with their live focus — the same
// stroke-dasharray technique as the Focus HUD's speed ring.
type FocusRingProps = {
  src: string;
  name: string;
  /** Live focus, 0..1. */
  fraction: number;
  color: string;
  /** Diameter in px. */
  size?: number;
};

const STROKE = 3.5;

export function FocusRing({ src, name, fraction, color, size = 44 }: FocusRingProps) {
  const clamped = Math.min(1, Math.max(0, fraction));
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const inset = STROKE + 1;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeOpacity={0.2}
          strokeWidth={STROKE}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      {/* Sprites share a 500x500 canvas with transparent margins, so the
          drawing is scaled up to fill the circle. */}
      <div className="absolute overflow-hidden rounded-full bg-white" style={{ inset }}>
        <img src={src} alt={name} className="size-full scale-[1.35] object-cover" />
      </div>
    </div>
  );
}
