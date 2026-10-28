"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/documents", label: "Documents" },
] as const;

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
            pathname === href && "bg-muted font-medium text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
