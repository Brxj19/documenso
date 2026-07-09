import { Badge } from '@documenso/ui/primitives/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { FileSignatureIcon, ShieldCheckIcon, UserCheckIcon, UsersIcon } from 'lucide-react';
import { Link } from 'react-router';
import { getExternalUsers, getInternalUsers } from './_users';

export default function EsignatureOverview() {
  const internalUsers = getInternalUsers();
  const externalUsers = getExternalUsers();

  return (
    <div>
      <h2 className="font-semibold text-lg">eSignature</h2>
      <p className="text-muted-foreground text-sm">Electronic signature overview</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Active Requests</CardTitle>
            <FileSignatureIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">1</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Completed</CardTitle>
            <ShieldCheckIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">2</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Internal Signers</CardTitle>
            <UserCheckIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{internalUsers.length}</div>
            <div className="text-muted-foreground text-xs">DMS User Directory</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">External Signers</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{externalUsers.length}</div>
            <div className="text-muted-foreground text-xs">Recipient-scoped guests</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">Signer Directory</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="font-medium text-muted-foreground text-xs">Internal Signers (DMS User Directory)</div>
            {internalUsers.map((u) => (
              <div key={u.userId} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                <div>
                  <span className="text-sm">{u.name}</span>
                  <span className="ml-2 text-muted-foreground text-xs">{u.email}</span>
                </div>
                <Badge variant="default" size="small">
                  DMS User
                </Badge>
              </div>
            ))}

            <div className="mt-4 font-medium text-muted-foreground text-xs">
              External Signers (Recipient-scoped Guests)
            </div>
            {externalUsers.map((u) => (
              <div key={u.userId} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                <div>
                  <span className="text-sm">{u.name}</span>
                  <span className="ml-2 text-muted-foreground text-xs">{u.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral" size="small">
                    External
                  </Badge>
                  {u.verificationMethod && (
                    <Badge variant="secondary" size="small">
                      {u.verificationMethod}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">Hybrid Signing Route</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                <UsersIcon className="h-4 w-4" />
                Stage 1: Regulatory Author
              </div>
              <div className="text-muted-foreground text-xs">Single signer · All required</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                <UsersIcon className="h-4 w-4" />
                Stage 2: Medical & Quality Review
              </div>
              <div className="text-muted-foreground text-xs">Parallel signers + External Consultant · All required</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                <UsersIcon className="h-4 w-4" />
                Stage 3: Regional Regulatory Lead
              </div>
              <div className="text-muted-foreground text-xs">Single signer · All required</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 text-muted-foreground text-xs">
        Open an approved file from the{' '}
        <Link to="/dms-prototype/files" className="text-blue-600 hover:underline">
          File Workspace
        </Link>{' '}
        to manage signing requests.
      </p>
    </div>
  );
}
