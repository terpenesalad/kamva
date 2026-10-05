/** Kamva mark: a canvas frame with a folded corner and a bold stroke "K" cut */
export function Logo({ size = 28, withWord = false }: { size?: number; withWord?: boolean }) {
  return (
    <span className="logo" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect x="2" y="2" width="28" height="28" rx="8" fill="var(--accent)" />
        <path d="M11 8v16M11 16.5 20.5 8M14.5 13.5 21 24" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="23.5" cy="23.5" r="2.4" fill="#ffb020" />
      </svg>
      {withWord && <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: size * 0.72, letterSpacing: '-0.02em' }}>Kamva</span>}
    </span>
  );
}
