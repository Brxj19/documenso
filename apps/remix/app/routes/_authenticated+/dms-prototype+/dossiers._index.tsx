import { Badge } from '@documenso/ui/primitives/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { EyeIcon, FileTextIcon, FolderOpenIcon } from 'lucide-react';
import { Link } from 'react-router';
import { DOSSIERS } from './_data.server';
import type { Route } from './+types/dossiers._index';

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'warning' | 'neutral' | 'destructive'> = {
  ACTIVE: 'default',
  PENDING_REVIEW: 'secondary',
  UNDER_REVIEW: 'secondary',
  APPROVED: 'default',
  SIGNING_IN_PROGRESS: 'warning',
  SIGNED_COMPLETE: 'neutral',
  SUBMITTED: 'neutral',
};

export async function loader(_args: Route.LoaderArgs) {
  return { dossiers: DOSSIERS };
}

export default function DossierList({ loaderData }: Route.ComponentProps) {
  const { dossiers } = loaderData;

  return (
    <div>
      <h2 className="font-semibold text-lg">Dossiers</h2>
      <p className="text-muted-foreground text-sm">Manage your regulatory dossiers</p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dossiers.map((dossier) => (
          <Link key={dossier.id} to={`/dms-prototype/dossiers/${dossier.id}`} className="block">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <CardTitle className="font-medium text-sm">{dossier.name}</CardTitle>
                <Badge variant={STATUS_COLORS[dossier.status] ?? 'neutral'} size="small">
                  {dossier.status.replace(/_/g, ' ')}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-muted-foreground text-xs">
                  <div className="flex items-center gap-1">
                    <FolderOpenIcon className="h-3 w-3" />
                    <span>{dossier.productRegion}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <EyeIcon className="h-3 w-3" />
                    <span>{dossier.owner}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FileTextIcon className="h-3 w-3" />
                    <span>{dossier.documentCount} documents</span>
                  </div>
                </div>
                <div className="mt-2 text-muted-foreground text-xs">
                  Updated {new Date(dossier.lastUpdated).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
