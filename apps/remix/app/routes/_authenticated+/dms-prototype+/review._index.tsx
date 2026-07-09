import { Badge } from '@documenso/ui/primitives/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { CheckCircleIcon, ClockIcon, FileSignatureIcon } from 'lucide-react';
import { Link } from 'react-router';

const WORKFLOW_STATES = [
  { label: 'Draft', icon: ClockIcon, variant: 'neutral' as const },
  { label: 'Under Review', icon: ClockIcon, variant: 'secondary' as const },
  { label: 'Review Completed', icon: CheckCircleIcon, variant: 'default' as const },
  { label: 'Pending Approval', icon: ClockIcon, variant: 'warning' as const },
  { label: 'Approved', icon: CheckCircleIcon, variant: 'default' as const },
  { label: 'Ready for eSignature', icon: FileSignatureIcon, variant: 'secondary' as const },
  { label: 'Signing In Progress', icon: ClockIcon, variant: 'warning' as const },
  { label: 'Signed Complete', icon: CheckCircleIcon, variant: 'default' as const },
  { label: 'Submitted', icon: CheckCircleIcon, variant: 'neutral' as const },
];

export default function ReviewAndApproval() {
  return (
    <div>
      <h2 className="font-semibold text-lg">Review & Approval</h2>
      <p className="text-muted-foreground text-sm">Manage document lifecycle and approval workflows</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">Workflow States</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {WORKFLOW_STATES.map((state) => (
              <Badge key={state.label} variant={state.variant} size="small">
                {state.label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">Available Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-muted-foreground text-sm">
            <li>Submit for Review</li>
            <li>Mark Review Complete</li>
            <li>Approve</li>
            <li>Reject</li>
            <li>Start eSignature (only after approval)</li>
          </ul>
        </CardContent>
      </Card>

      <p className="mt-6 text-muted-foreground text-xs">
        Open a file from the{' '}
        <Link to="/dms-prototype/files" className="text-blue-600 hover:underline">
          File Workspace
        </Link>{' '}
        to manage its signature workflow.
      </p>
    </div>
  );
}
