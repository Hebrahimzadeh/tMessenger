/**
 * Until Task 32 adds real avatar uploads, every avatar is computed on the
 * fly from displayName-initials and a stable, seed-derived color (Task 08:
 * "avatar از حروف اول نام و رنگ پایدار تولید شود و URL دلخواه کاربر
 * پذیرفته نشود") - no backend field, no user-supplied URL, nothing stored.
 */
const AVATAR_COLORS = [
  '#F87171',
  '#FB923C',
  '#FBBF24',
  '#A3E635',
  '#34D399',
  '#22D3EE',
  '#60A5FA',
  '#A78BFA',
  '#F472B6',
  '#FB7185',
];

export function getAvatarInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** Deterministic color from a seed (e.g. userId or username) - same seed always yields the same color, so an avatar never changes color across renders/sessions. */
export function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}
