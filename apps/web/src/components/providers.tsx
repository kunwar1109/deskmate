"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { RealtimeConnection } from "@/components/realtime";
import { Toaster } from "@/components/ui/sonner";
import { ApiRequestError } from "@/lib/api";

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  // useState, not a module-level constant, so each browser tab (and each server render) gets its own cache.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (err) => {
            // Session expired or logged out in another tab: any 401 sends the user to log in again.
            if (err instanceof ApiRequestError && err.status === 401) router.replace("/login");
          },
        }),
        defaultOptions: {
          queries: {
            retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 2,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <RealtimeConnection />
      <Toaster richColors position="bottom-right" />
    </QueryClientProvider>
  );
}
