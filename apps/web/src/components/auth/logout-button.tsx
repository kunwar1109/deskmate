"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/api";

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await postJson("/auth/logout"); // the API clears the httpOnly cookie; JS can't touch it
          router.replace("/login");
          router.refresh();
        })
      }
    >
      {pending ? "Logging out…" : "Log out"}
    </Button>
  );
}
