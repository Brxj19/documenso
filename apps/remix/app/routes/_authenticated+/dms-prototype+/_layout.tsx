import { cn } from '@documenso/ui/lib/utils';
import { Button } from '@documenso/ui/primitives/button';
import {
  FileSignatureIcon,
  FileSpreadsheetIcon,
  FolderOpenIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { Outlet, useLocation } from 'react-router';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/dms-prototype', label: 'Dashboard', icon: <LayoutDashboardIcon className="h-5 w-5" /> },
  { href: '/dms-prototype/dossiers', label: 'Dossiers', icon: <FolderOpenIcon className="h-5 w-5" /> },
  { href: '/dms-prototype/files', label: 'File Workspace', icon: <FileSpreadsheetIcon className="h-5 w-5" /> },
  { href: '/dms-prototype/review', label: 'Review & Approval', icon: <ShieldCheckIcon className="h-5 w-5" /> },
  { href: '/dms-prototype/esignature', label: 'eSignature', icon: <FileSignatureIcon className="h-5 w-5" /> },
  { href: '/dms-prototype/admin', label: 'Admin', icon: <SettingsIcon className="h-5 w-5" /> },
];

export default function DmsPrototypeLayout() {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-4 md:px-8">
      <div className="flex items-center justify-between pt-6 pb-4">
        <div>
          <h1 className="font-semibold text-2xl">Authora DMS</h1>
          <p className="text-muted-foreground text-sm">Document Lifecycle Management</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-x-8">
        <nav className="col-span-12 mb-8 md:col-span-3 md:mb-0">
          <div className="flex flex-col gap-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive =
                pathname === item.href || (item.href !== '/dms-prototype' && pathname.startsWith(item.href));
              return (
                <a key={item.href} href={item.href}>
                  <Button variant="ghost" className={cn('w-full justify-start', isActive && 'bg-secondary')}>
                    {item.icon}
                    <span className="ml-2">{item.label}</span>
                  </Button>
                </a>
              );
            })}
          </div>
        </nav>

        <main className="col-span-12 md:col-span-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
