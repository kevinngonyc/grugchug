export function SpeedRing({ fraction }: { fraction: number }) {
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, fraction));

  return (
    <svg
      viewBox="0 0 24 24"
      className="absolute top-1 right-1 size-5 -rotate-90"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r={radius} fill="none" className="stroke-muted" strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        className="stroke-primary"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
      />
    </svg>
  );
}
