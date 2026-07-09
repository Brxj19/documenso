import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@documenso/ui/primitives/tabs';
import { ArrowLeftIcon, ClockIcon, FileTextIcon } from 'lucide-react';
import { Link } from 'react-router';
import { getDossierById, getFilesByDossierId, getRecentActivity } from './_data.server';
import type { Route } from './+types/dossiers.$dossierId._index';

export async function loader({ params }: Route.LoaderArgs) {
  const dossier = getDossierById(params.dossierId);
  if (!dossier) {
    throw new Response('Not Found', { status: 404 });
  }
  const files = getFilesByDossierId(dossier.id);
  return { dossier, files };
}

export default function DossierDetail({ loaderData }: Route.ComponentProps) {
  const { dossier, files } = loaderData;

  return (
    <div>
      <Link to="/dms-prototype/dossiers" className="mb-4 flex items-center gap-1 text-muted-foreground text-sm">
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Dossiers
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold text-lg">{dossier.name}</h2>
          <p className="text-muted-foreground text-sm">{dossier.id}</p>
        </div>
        <Badge variant="default" size="small">
          {dossier.productRegion}
        </Badge>
      </div>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Dossier Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-medium">{dossier.status.replace(/_/g, ' ')}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd className="font-medium">{dossier.owner}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Product / Region</dt>
                  <dd className="font-medium">{dossier.productRegion}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Documents</dt>
                  <dd className="font-medium">{dossier.documentCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-medium">{new Date(dossier.createdAt).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last Updated</dt>
                  <dd className="font-medium">{new Date(dossier.lastUpdated).toLocaleDateString()}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" disabled>
              Add Document
            </Button>
            <Button variant="outline" size="sm" disabled>
              Start Review
            </Button>
            <Button variant="outline" size="sm" disabled>
              Start Approval
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <div className="space-y-2">
            {files.map((file) => (
              <Link key={file.id} to={`/dms-prototype/files/${file.id}`} className="block">
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <FileTextIcon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium text-sm">{file.name}</div>
                        <div className="text-muted-foreground text-xs">
                          {file.version} · {file.fileType}
                        </div>
                      </div>
                    </div>
                    <Badge variant="neutral" size="small">
                      {file.status.replace(/_/g, ' ')}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <div className="space-y-2">
            {getRecentActivity().filter((a) => a.dossierId === dossier.id).length === 0 && (
              <p className="text-muted-foreground text-sm">No recent activity for this dossier.</p>
            )}
            {getRecentActivity()
              .filter((a) => a.dossierId === dossier.id)
              .map((activity, idx) => (
                <div key={idx} className="flex items-center gap-3 border-border border-b py-2 text-sm">
                  <ClockIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground text-xs">
                    {new Date(activity.timestamp).toLocaleDateString()}
                  </span>
                  <span className="flex-1">{activity.description}</span>
                </div>
              ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
