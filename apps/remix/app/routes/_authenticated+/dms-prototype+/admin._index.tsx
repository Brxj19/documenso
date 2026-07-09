import { Badge } from '@documenso/ui/primitives/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { ADMIN_SETTINGS } from './_data.server';
import type { Route } from './+types/admin._index';

export async function loader(_args: Route.LoaderArgs) {
  return { settings: ADMIN_SETTINGS };
}

export default function AdminSettings({ loaderData }: Route.ComponentProps) {
  const { settings } = loaderData;
  const categories = [...new Set(settings.map((s) => s.category))];

  return (
    <div>
      <h2 className="font-semibold text-lg">Admin Settings</h2>
      <p className="text-muted-foreground text-sm">Prototype settings — read only</p>

      <div className="mt-6 space-y-6">
        {categories.map((category) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="text-sm">{category}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border text-sm">
                {settings
                  .filter((s) => s.category === category)
                  .map((setting) => (
                    <div key={setting.id} className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">{setting.label}</span>
                      <span className="font-medium">
                        {setting.type === 'toggle' ? (
                          <Badge variant={setting.value === 'true' ? 'default' : 'neutral'} size="small">
                            {setting.value === 'true' ? 'Enabled' : 'Disabled'}
                          </Badge>
                        ) : (
                          setting.value
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
