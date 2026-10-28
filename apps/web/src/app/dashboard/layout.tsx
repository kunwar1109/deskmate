import Link from "next/link";
import { Suspense } from "react";
import { UserMenu, UserMenuSkeleton } from "@/components/dashboard/user-menu";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href="/dashboard" className="font-semibold">
          Deskmate
        </Link>
        {/* The header renders instantly; only the part that needs the session waits for it. */}
        <Suspense fallback={<UserMenuSkeleton />}>
          <UserMenu />
        </Suspense>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">{children}</main>
    </div>
  );
}
