import type { PublicProfileResponse } from '@taavon/contracts';
import { Avatar } from './Avatar';
import { StartPrivateChatButton } from './StartPrivateChatButton';

export interface PublicProfileViewProps {
  profile: PublicProfileResponse;
  /** Omitted for a visitor with no session, and for one's own profile. */
  canStartChat?: boolean;
}

export function PublicProfileView({ profile, canStartChat = false }: PublicProfileViewProps) {
  return (
    <div dir="rtl" className="min-h-[100dvh] bg-gray-50 p-6 text-right">
      <div className="flex items-center gap-4 mb-4">
        <Avatar displayName={profile.displayName} seed={profile.username} size={64} />
        <div>
          <h1 className="text-xl font-bold text-gray-900">{profile.displayName}</h1>
          <p className="text-sm text-gray-500" dir="ltr">
            @{profile.username}
          </p>
        </div>
      </div>

      {profile.bio && <p className="mb-4 whitespace-pre-wrap text-gray-700">{profile.bio}</p>}

      {canStartChat && (
        <div className="mb-4">
          <StartPrivateChatButton userId={profile.userId} />
        </div>
      )}

      {profile.phoneE164 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500 mb-1">شماره تماس</p>
          <p className="text-gray-900" dir="ltr">
            {profile.phoneE164}
          </p>
        </div>
      )}
    </div>
  );
}
