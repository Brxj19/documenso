import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { AlertCircleIcon, ExternalLinkIcon, ShieldCheckIcon, ShieldXIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { data, Link } from 'react-router';
import { getParticipantBlockedReason } from './_auth-policy';
import { getParticipantIdentity } from './_identity';
import { DmsSigningClient } from './_signing-client.server';
import { getWorkflowBySigningRequestId } from './_workflow';
import type { Route } from './+types/signing.$requestId.participants.$participantId._index';

type SigningLaunchResult =
  | { status: 'success'; launchUrl: string; participantName: string; requestId: string }
  | { status: 'blocked'; reason: string; participantName: string }
  | { status: 'completed'; reason: string; participantName: string }
  | { status: 'unverified'; participantId: string; participantName: string }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string };

export async function loader({ params }: Route.LoaderArgs) {
  const { requestId, participantId } = params;

  const workflow = getWorkflowBySigningRequestId(requestId);

  if (!workflow) {
    return data({ result: { status: 'not_found', message: 'Signing request not found' } } satisfies {
      result: SigningLaunchResult;
    });
  }

  const participant = workflow.participants.find((p) => p.participantId === participantId);

  if (!participant) {
    return data({
      result: { status: 'not_found', message: 'Participant not found in this signing request' },
    } satisfies { result: SigningLaunchResult });
  }

  const blockedReason = getParticipantBlockedReason(workflow.signingRequestStatus, undefined);

  if (blockedReason) {
    return data({
      result: {
        status: 'blocked',
        reason: blockedReason,
        participantName: participant.name,
      },
    } satisfies { result: SigningLaunchResult });
  }

  if (workflow.signingRequestStatus === 'COMPLETED') {
    return data({
      result: {
        status: 'completed',
        reason: 'Document has been fully signed',
        participantName: participant.name,
      },
    } satisfies { result: SigningLaunchResult });
  }

  const identity = getParticipantIdentity(participantId);

  if (participant.metadata.identitySource === 'EXTERNAL_RECIPIENT') {
    if (!identity || identity.verificationStatus !== 'VERIFIED') {
      return data({
        result: {
          status: 'unverified',
          participantId,
          participantName: participant.name,
        },
      } satisfies { result: SigningLaunchResult });
    }
  }

  const apiToken = typeof process !== 'undefined' && process.env.INTEGRATION_API_V1_TOKEN;
  if (!apiToken) {
    return data({ result: { status: 'error', message: 'Integration API token not configured' } } satisfies {
      result: SigningLaunchResult;
    });
  }

  try {
    const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const client = new DmsSigningClient(apiToken, baseUrl);

    const dossierId = workflow.dossierId;
    const fileRecord = await import('./_data.server').then((m) => m.getFileById(workflow.fileId));
    const returnUrl = fileRecord
      ? `${baseUrl}/dms-prototype/files/${fileRecord.id}?signed=true`
      : `${baseUrl}/dms-prototype`;

    const session = await client.createSigningSession(requestId, participantId, returnUrl);

    return data({
      result: {
        status: 'success',
        launchUrl: session.launchUrl,
        participantName: participant.name,
        requestId,
      },
    } satisfies { result: SigningLaunchResult });
  } catch (err) {
    return data({
      result: {
        status: 'error',
        message: `Failed to create signing session: ${String(err)}`,
      },
    } satisfies { result: SigningLaunchResult });
  }
}

export default function SigningLaunch({ loaderData }: Route.ComponentProps) {
  const { result } = loaderData;
  const [autoRedirected, setAutoRedirected] = useState(false);

  useEffect(() => {
    if (result.status === 'success' && !autoRedirected) {
      const timer = setTimeout(() => {
        window.location.href = result.launchUrl;
        setAutoRedirected(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [result, autoRedirected]);

  if (result.status === 'success') {
    return (
      <div className="mx-auto max-w-lg py-12">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-green-600" />
              <CardTitle className="text-sm">Signing Session Ready</CardTitle>
            </div>
            <CardDescription>You will be redirected to the signing page shortly.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-md bg-muted/50 p-3">
              <div className="text-muted-foreground text-xs">Signer</div>
              <div className="font-medium text-sm">{result.participantName}</div>
            </div>
            <a
              href={result.launchUrl}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
            >
              <ExternalLinkIcon className="h-4 w-4" />
              Open Signing Page
            </a>
            <p className="mt-2 text-center text-muted-foreground text-xs">Redirecting automatically...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (result.status === 'blocked') {
    return (
      <div className="mx-auto max-w-lg py-12">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldXIcon className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-sm">Signing Not Available</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-md bg-muted/50 p-3">
              <div className="text-muted-foreground text-xs">Signer</div>
              <div className="font-medium text-sm">{result.participantName}</div>
            </div>
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{result.reason}</span>
            </div>
            <div className="mt-4">
              <Link to="/dms-prototype/files" className="text-blue-600 text-sm hover:underline">
                Return to File Workspace
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (result.status === 'completed') {
    return (
      <div className="mx-auto max-w-lg py-12">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-green-600" />
              <CardTitle className="text-sm">Already Completed</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-md bg-muted/50 p-3">
              <div className="text-muted-foreground text-xs">Signer</div>
              <div className="font-medium text-sm">{result.participantName}</div>
            </div>
            <p className="text-muted-foreground text-sm">{result.reason}</p>
            <div className="mt-4">
              <Link to="/dms-prototype/files" className="text-blue-600 text-sm hover:underline">
                Return to File Workspace
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (result.status === 'unverified') {
    return (
      <div className="mx-auto max-w-lg py-12">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircleIcon className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-sm">Verification Required</CardTitle>
            </div>
            <CardDescription>You must verify your identity before signing.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-md bg-muted/50 p-3">
              <div className="text-muted-foreground text-xs">Signer</div>
              <div className="font-medium text-sm">{result.participantName}</div>
            </div>
            <Link
              to={`/dms-prototype/external-sign/${result.participantId}/verify`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
            >
              Go to Verification
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-12">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircleIcon className="h-5 w-5 text-red-600" />
            <CardTitle className="text-sm">Error</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{result.message}</p>
          <div className="mt-4">
            <Link to="/dms-prototype/files" className="text-blue-600 text-sm hover:underline">
              Return to File Workspace
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
