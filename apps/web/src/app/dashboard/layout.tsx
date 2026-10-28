import Link from "next/link";
import { Suspense } from "react";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { UserMenu, UserMenuSkeleton } from "@/components/dashboard/user-menu";
import { Providers } from "@/components/providers";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <Providers>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold">
              Deskmate
            </Link>
            {/* usePathname makes the nav request-time, so it needs its own boundary under Cache Components. */}
            <Suspense fallback={null}>
              <DashboardNav />
            </Suspense>
          </div>
          {/* The header renders instantly; only the part that needs the session waits for it. */}
          <Suspense fallback={<UserMenuSkeleton />}>
            <UserMenu />
          </Suspense>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 p-6">{children}</main>
      </div>
    </Providers>
  );
}
