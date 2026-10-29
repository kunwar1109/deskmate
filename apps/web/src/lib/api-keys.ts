import type { ApiKeyList, CreateApiKeyInput, CreatedApiKey } from "@deskmate/shared/api-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, postJson } from "@/lib/api";

const apiKeysKey = ["api-keys"] as const;

export function useApiKeys() {
  return useQuery({ queryKey: apiKeysKey, queryFn: () => apiFetch<ApiKeyList>("/api-keys") });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApiKeyInput) => postJson<CreatedApiKey>("/api-keys", input),
    // Refetch rather than insert: the list must hold summaries only, never the full key from this response.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeysKey }),
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeysKey }),
  });
}

/** Setup for two common MCP clients. The key comes from an environment variable, so it isn't pasted into files. */
export function clientSetup(mcpUrl: string) {
  return {
    claudeCode: `claude mcp add --transport http deskmate ${mcpUrl} \\\n  --header "Authorization: Bearer $DESKMATE_API_KEY"`,
    cursor: JSON.stringify(
      { mcpServers: { deskmate: { url: mcpUrl, headers: { Authorization: "Bearer ${env:DESKMATE_API_KEY}" } } } },
      null,
      2,
    ),
  };
}
