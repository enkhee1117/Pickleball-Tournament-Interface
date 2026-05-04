export type AvatarPlayer = {
  name?: string;
  short: string;
  color: string;
};

type AvatarProps = {
  player?: AvatarPlayer | null;
  size?: number;
  ring?: boolean;
};

export function Avatar({ player, size = 40, ring = false }: AvatarProps) {
  if (!player) return null;
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: player.color,
        fontFamily: 'var(--font-geist), Geist, system-ui, sans-serif',
        fontWeight: 600,
        fontSize: size * 0.36,
        color: 'oklch(0.25 0.04 60)',
        boxShadow: ring ? '0 0 0 2px var(--paper), 0 0 0 4px var(--court)' : 'none',
      }}
    >
      {player.short}
    </div>
  );
}

const AVATAR_COLORS = [
  '#E8C5A0', '#C8D5B9', '#F4C7B5', '#B8C9E0', '#D9C5E0',
  '#F0D9A8', '#A8C8B0', '#E0B8C0', '#C5D0E0', '#E8D0B0',
];

export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function shortFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function playerFromName(name: string): AvatarPlayer {
  return { name, short: shortFromName(name), color: colorForName(name) };
}
