'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { OtpRequestResponse } from '@taavon/contracts';
import { PhoneForm } from './PhoneForm';
import { OtpForm } from './OtpForm';

type Step =
  | { name: 'phone'; notice?: string }
  | {
      name: 'otp';
      phone: string;
      country: string;
      challengeId: string;
      expiresInSeconds: number;
      termsVersion: number;
      privacyVersion: number;
    };

export interface LoginFlowProps {
  /** Already sanitized by the server component (lib/auth/redirect-allowlist.ts) before this ever renders - never a raw, unvalidated user-controlled value. */
  next: string;
}

export function LoginFlow({ next }: LoginFlowProps) {
  const [step, setStep] = useState<Step>({ name: 'phone' });
  const router = useRouter();

  function handleRequested(result: OtpRequestResponse, phone: string, country: string) {
    setStep({ name: 'otp', phone, country, ...result });
  }

  function handleVerified() {
    router.push(next);
    router.refresh();
  }

  function handleLegalVersionChanged(message: string) {
    // Bounces back to the phone step rather than staying on the OTP step -
    // the old challenge can never succeed again once its version no longer
    // matches current (see auth.service.ts), so a fresh request is the only
    // way forward. The phone step already links to /legal/terms and
    // /legal/privacy for the *current* version; this notice just explains
    // why the user landed back here.
    setStep({ name: 'phone', notice: message });
  }

  if (step.name === 'phone') {
    return <PhoneForm onRequested={handleRequested} notice={step.notice} />;
  }

  return (
    <OtpForm
      phone={step.phone}
      country={step.country}
      challengeId={step.challengeId}
      expiresInSeconds={step.expiresInSeconds}
      termsVersion={step.termsVersion}
      privacyVersion={step.privacyVersion}
      onVerified={handleVerified}
      onLegalVersionChanged={handleLegalVersionChanged}
    />
  );
}
