"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useInbox } from "@/lib/inbox";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/documents", label: "Documents" },
  { href: "/dashboard/playground", label: "Test chat" },
  { href: "/dashboard/widget", label: "Widget" },
] as const;

export function DashboardNav() {
  const pathname = usePathname();
  // Same cache as the inbox's "Needs a human" tab, so the socket keeps this count live too.
  const { data: waiting } = useInbox("needs_human");
  const waitingCount = waiting?.length ?? 0;

  return (
    <nav className="flex gap-1">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
            pathname === href && "bg-muted font-medium text-foreground",
          )}
        >
          {label}
          {href === "/dashboard/inbox" && waitingCount > 0 && (
            <span
              className="rounded-full bg-destructive px-1.5 text-xs leading-5 font-medium text-white"
              aria-label={`${waitingCount} waiting`}
            >
              {waitingCount >= 50 ? "50+" : waitingCount}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
