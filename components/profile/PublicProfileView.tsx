import type { PublicProfileResponse } from '@taavon/contracts';
import { Avatar } from './Avatar';

export interface PublicProfileViewProps {
  profile: PublicProfileResponse;
}

export function PublicProfileView({ profile }: PublicProfileViewProps) {
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
