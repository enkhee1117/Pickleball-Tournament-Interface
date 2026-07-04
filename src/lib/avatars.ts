/* The built-in avatar gallery — illustrated pickleball characters players can
   pick from instead of uploading a photo. Files live in /public/avatars. */

export type PresetAvatar = {
  id: string;
  src: string;
  label: string;
};

export const PRESET_AVATARS: PresetAvatar[] = [
  { id: 'p2', src: '/avatars/p2.png', label: 'Green headband' },
  { id: 'p3', src: '/avatars/p3.png', label: 'Galaxy paddle' },
  { id: 'p4', src: '/avatars/p4.png', label: 'Neon goggles' },
  { id: 'p5', src: '/avatars/p5.png', label: 'Sky blue tee' },
  { id: 'p6', src: '/avatars/p6.png', label: 'Wood paddle' },
  { id: 'p7', src: '/avatars/p7.png', label: 'Gold braids' },
  { id: 'p8', src: '/avatars/p8.png', label: 'Fur collar' },
  { id: 'p9', src: '/avatars/p9.png', label: 'Orange tank' },
  { id: 'p10', src: '/avatars/p10.png', label: 'Glasses & bun' },
  { id: 'p11', src: '/avatars/p11.png', label: 'Pink sparkle' },
  { id: 'p12', src: '/avatars/p12.png', label: 'Teal visor' },
];

/** True when the stored avatar_url points at one of the built-in presets. */
export function isPresetAvatar(url: string | null | undefined): boolean {
  if (!url) return false;
  return PRESET_AVATARS.some((a) => a.src === url);
}
