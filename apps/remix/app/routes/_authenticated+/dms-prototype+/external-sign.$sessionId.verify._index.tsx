import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { ShieldCheckIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { data, useFetcher } from 'react-router';
import { getParticipantIdentity, IDENTITY_OTP } from './_identity';
import type { Route } from './+types/external-sign.$sessionId.verify._index';

export async function loader({ params }: Route.LoaderArgs) {
  const identity = getParticipantIdentity(params.sessionId);

  if (!identity) {
    throw new Response('Verification session not found', { status: 404 });
  }

  const name = identity.name ?? 'External Signer';
  const email = identity.email ?? 'unknown';

  return { name, email, verified: identity.verificationStatus === 'VERIFIED' };
}

export async function action({ request, params }: Route.ActionArgs) {
  const identity = getParticipantIdentity(params.sessionId);

  if (!identity) {
    return data({ error: 'Verification session not found' }, { status: 404 });
  }

  if (identity.verificationStatus === 'VERIFIED') {
    return data({ success: true, message: 'Already verified' });
  }

  const formData = await request.formData();
  const otp = formData.get('otp') as string;

  if (!otp) {
    return data({ error: 'OTP is required' }, { status: 400 });
  }

  if (otp !== IDENTITY_OTP) {
    return data({ error: 'Invalid OTP. Please try again.' }, { status: 400 });
  }

  return data({ success: true, message: 'Verification successful' });
}

export default function ExternalSignerVerify({ loaderData }: Route.ComponentProps) {
  const { name, email } = loaderData;
  const fetcher = useFetcher<{ error?: string; success?: boolean; message?: string }>();
  const otpRef = useRef<HTMLInputElement>(null);
  const [localVerified, setLocalVerified] = useState(loaderData.verified);
  const [localError, setLocalError] = useState<string | undefined>();
  const [localSuccess, setLocalSuccess] = useState<string | undefined>();

  const isVerifying = fetcher.state === 'submitting';

  const result = fetcher.data;
  const displayError = localError ?? result?.error;
  const displaySuccess = localSuccess ?? (result?.success ? result.message : undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const otp = otpRef.current?.value;
    if (!otp) {
      setLocalError('Please enter the verification code');
      return;
    }
    setLocalError(undefined);
    setLocalSuccess(undefined);
    fetcher.submit(e.currentTarget as HTMLFormElement, { method: 'POST' });
  };

  return (
    <div className="mx-auto max-w-lg py-12">
      <div className="mb-8 text-center">
        <h1 className="font-semibold text-2xl">Authora DMS</h1>
        <p className="text-muted-foreground text-sm">Secure Document Signing</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-sm">Identity Verification Required</CardTitle>
          </div>
          <CardDescription>
            Before signing, please verify your identity. A one-time passcode has been sent to{' '}
            <span className="font-medium">{email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-md bg-muted/50 p-3">
            <div className="text-muted-foreground text-xs">Signer</div>
            <div className="font-medium text-sm">{name}</div>
            <div className="text-muted-foreground text-xs">{email}</div>
          </div>

          {displaySuccess && !localVerified ? (
            <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-800 text-sm dark:border-green-800 dark:bg-green-950 dark:text-green-200">
              {displaySuccess}
            </div>
          ) : localVerified ? (
            <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800 text-sm dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
              You have already been verified.
            </div>
          ) : null}

          {displayError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {displayError}
            </div>
          )}

          {!localVerified && (
            <fetcher.Form method="POST" onSubmit={handleSubmit}>
              <div className="mb-4">
                <label htmlFor="otp" className="mb-1 block font-medium text-sm">
                  Verification Code
                </label>
                <input
                  ref={otpRef}
                  id="otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  maxLength={6}
                  disabled={isVerifying}
                />
                <p className="mt-1 text-muted-foreground text-xs">
                  Prototype: Use code <span className="font-medium font-mono">{IDENTITY_OTP}</span>
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={isVerifying}>
                {isVerifying ? 'Verifying...' : 'Verify & Proceed to Sign'}
              </Button>
            </fetcher.Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
