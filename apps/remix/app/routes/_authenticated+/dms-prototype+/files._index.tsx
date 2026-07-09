import { Badge } from '@documenso/ui/primitives/badge';
import { Card, CardContent } from '@documenso/ui/primitives/card';
import { FileTextIcon } from 'lucide-react';
import { Link } from 'react-router';
import { FILES } from './_data.server';
import type { Route } from './+types/files._index';

export async function loader(_args: Route.LoaderArgs) {
  return { files: FILES };
}

export default function FileList({ loaderData }: Route.ComponentProps) {
  const { files } = loaderData;

  return (
    <div>
      <h2 className="font-semibold text-lg">File Workspace</h2>
      <p className="text-muted-foreground text-sm">All files across dossiers</p>

      <div className="mt-4 space-y-2">
        {files.map((file) => (
          <Link key={file.id} to={`/dms-prototype/files/${file.id}`} className="block">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <FileTextIcon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium text-sm">{file.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {file.dossierId} · {file.version} · {file.fileType}
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
    </div>
  );
}
