type TPMarkProps = { size?: number; color?: string; accent?: string };

export function TPMark({ size = 28, color = 'var(--ink)', accent = 'var(--court)' }: TPMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="6" y="6" width="20" height="20" rx="3" transform="rotate(45 16 16)" stroke={color} strokeWidth="2" />
      <line x1="16" y1="3.5" x2="16" y2="28.5" stroke={color} strokeWidth="2" strokeDasharray="1.5 1.8" />
      <circle cx="11" cy="20" r="2.2" fill={accent} />
      <circle cx="21" cy="12" r="2.2" fill={accent} />
    </svg>
  );
}

export function TPWordmark({ size = 18, color = 'var(--ink)', accent = 'var(--court)' }: TPMarkProps) {
  return (
    <div className="flex items-center gap-2">
      <TPMark size={size + 8} color={color} accent={accent} />
      <span className="serif leading-none tracking-tight" style={{ fontSize: size + 6, color }}>
        TourneyPal
      </span>
    </div>
  );
}
