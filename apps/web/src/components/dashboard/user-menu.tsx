import { LogoutButton } from "@/components/auth/logout-button";
import { getCurrentUser } from "@/lib/session";

export async function UserMenu() {
  const { user, workspace } = await getCurrentUser();
  return (
    <div className="flex items-center gap-3">
      <div className="text-right text-sm leading-tight">
        <p className="font-medium">{user.name}</p>
        <p className="text-muted-foreground">{workspace.name}</p>
      </div>
      <LogoutButton />
    </div>
  );
}

export function UserMenuSkeleton() {
  return <div className="h-9 w-40 animate-pulse rounded-md bg-muted" aria-label="Loading account" />;
}
