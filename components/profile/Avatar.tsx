import { getAvatarColor, getAvatarInitials } from '@/lib/avatar';

export interface AvatarProps {
  displayName: string;
  /** Stable seed for the color (userId or username) - not the displayName itself, so a display-name edit doesn't change someone's avatar color. */
  seed: string;
  size?: number;
}

export function Avatar({ displayName, seed, size = 40 }: AvatarProps) {
  return (
    <div
      role="img"
      aria-label={`تصویر پروفایل ${displayName}`}
      className="flex items-center justify-center rounded-full font-medium text-white select-none"
      style={{ backgroundColor: getAvatarColor(seed), width: size, height: size, fontSize: size * 0.4 }}
    >
      {getAvatarInitials(displayName)}
    </div>
  );
}
