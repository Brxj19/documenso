import { Badge } from '@documenso/ui/primitives/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import {
  BriefcaseIcon,
  CheckCircleIcon,
  ClockIcon,
  FileSignatureIcon,
  FileTextIcon,
  SearchCheckIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { DOSSIERS, FILES, getRecentActivity } from './_data.server';
import type { Route } from './+types/_index';

export async function loader(_args: Route.LoaderArgs) {
  return {
    activeDossiers: DOSSIERS.filter(
      (d) => d.status === 'ACTIVE' || d.status === 'UNDER_REVIEW' || d.status === 'PENDING_REVIEW',
    ).length,
    draftDocuments: FILES.filter((f) => f.status === 'DRAFT').length,
    pendingReview: DOSSIERS.filter((d) => d.status === 'PENDING_REVIEW' || d.status === 'UNDER_REVIEW').length,
    pendingApproval: DOSSIERS.filter((d) => d.status === 'APPROVED' && d.status !== 'SIGNING_IN_PROGRESS').length,
    awaitingSignature: DOSSIERS.filter((d) => d.status === 'APPROVED').length,
    completedSigned: DOSSIERS.filter((d) => d.status === 'SIGNED_COMPLETE' || d.status === 'SUBMITTED').length,
    recentActivity: getRecentActivity(),
  };
}

export default function DmsDashboard({ loaderData }: Route.ComponentProps) {
  const stats = loaderData;

  const statCards = [
    { label: 'Active Dossiers', value: stats.activeDossiers, icon: BriefcaseIcon },
    { label: 'Documents in Draft', value: stats.draftDocuments, icon: FileTextIcon },
    { label: 'Pending Review', value: stats.pendingReview, icon: SearchCheckIcon },
    { label: 'Pending Approval', value: stats.pendingApproval, icon: ShieldCheckIcon },
    { label: 'Awaiting eSignature', value: stats.awaitingSignature, icon: FileSignatureIcon },
    { label: 'Completed Signed Files', value: stats.completedSigned, icon: CheckCircleIcon },
  ];

  return (
    <div>
      <h2 className="font-semibold text-lg">Dashboard</h2>
      <p className="text-muted-foreground text-sm">Overview of your document lifecycle</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-medium text-muted-foreground text-sm">{card.label}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <h3 className="mt-8 font-semibold text-base">Recent Activity</h3>
      <div className="mt-2 space-y-2">
        {stats.recentActivity.map((activity, idx) => (
          <div key={idx} className="flex items-center gap-3 border-border border-b py-2 text-sm">
            <ClockIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-muted-foreground">{new Date(activity.timestamp).toLocaleDateString()}</span>
            <span className="flex-1">{activity.description}</span>
            <Badge variant="neutral" size="small">
              {activity.dossierId}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
