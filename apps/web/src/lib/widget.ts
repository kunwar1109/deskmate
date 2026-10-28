import type { AllowedOriginsInput, WidgetSettings } from "@deskmate/shared/widget";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, postJson } from "@/lib/api";

const widgetKey = ["widget"] as const;

export function useWidgetSettings() {
  return useQuery({ queryKey: widgetKey, queryFn: () => apiFetch<WidgetSettings>("/widget") });
}

export function useUpdateAllowedOrigins() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AllowedOriginsInput) =>
      apiFetch<WidgetSettings>("/widget/allowed-origins", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: (settings) => queryClient.setQueryData(widgetKey, settings),
  });
}

export function useRotateWidgetKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postJson<WidgetSettings>("/widget/rotate-key"),
    onSuccess: (settings) => queryClient.setQueryData(widgetKey, settings),
  });
}

/** The one line a customer pastes into their site. */
export function embedSnippet({ scriptUrl, key }: WidgetSettings): string {
  return `<script src="${scriptUrl}" data-widget-key="${key}" async></script>`;
}
