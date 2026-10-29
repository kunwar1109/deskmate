import type { ApiKeySummary, CreatedApiKey } from "@deskmate/shared/api-keys";
import { beforeEach, describe, expect, it } from "@jest/globals";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiKeysPanel } from "@/components/api-keys/api-keys-panel";
import { jsonResponse, mockFetch, renderWithQuery } from "@/test/utils";

const MCP_URL = "https://api.deskmate.test/mcp";
const FULL_KEY = "dmk_AbCdEf0123456789abcdef0123456789ABCDEFghijk";

describe("ApiKeysPanel", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  let keys: ApiKeySummary[];

  /** A fake API that keeps its key list in memory, like the server: summaries only. */
  beforeEach(() => {
    keys = [];
    fetchMock = mockFetch();
    fetchMock.mockImplementation(async (input, init) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return jsonResponse(200, { mcpUrl: MCP_URL, keys });
      if (method === "POST") {
        const { name } = JSON.parse(init!.body as string) as { name: string };
        const summary = { id: "k1", name, prefix: FULL_KEY.slice(0, 10), createdAt: new Date().toISOString(), lastUsedAt: null };
        keys = [summary];
        return jsonResponse(201, { ...summary, key: FULL_KEY } satisfies CreatedApiKey);
      }
      if (method === "DELETE") {
        keys = [];
        return jsonResponse(204);
      }
      throw new Error(`unexpected ${method} ${String(input)}`);
    });
  });

  it("shows a new key once, then only its prefix", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ApiKeysPanel />);

    await user.type(await screen.findByLabelText("Key name"), "Cursor on my laptop");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(await screen.findByLabelText("New API key")).toHaveTextContent(FULL_KEY);
    expect(screen.getByText(/you won.t see it again/)).toBeInTheDocument();
    const row = (await screen.findByRole("cell", { name: "Cursor on my laptop" })).closest("tr") as HTMLElement;
    expect(within(row).getByText("dmk_AbCdEf…")).toBeInTheDocument();
    expect(within(row).getByText("Never")).toBeInTheDocument(); // not used yet

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText(FULL_KEY)).not.toBeInTheDocument(); // gone from the page for good
  });

  it("validates the name with the shared schema before sending", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ApiKeysPanel />);

    await user.click(await screen.findByRole("button", { name: "Create key" }));

    expect(screen.getByText(/Give the key a name/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("gives setup snippets that read the key from an environment variable, never the key itself", async () => {
    renderWithQuery(<ApiKeysPanel />);

    const claude = await screen.findByText(/claude mcp add --transport http deskmate/);
    expect(claude).toHaveTextContent(`${MCP_URL}`);
    expect(claude).toHaveTextContent('--header "Authorization: Bearer $DESKMATE_API_KEY"');
    expect(screen.getByText(/"Bearer \$\{env:DESKMATE_API_KEY\}"/)).toBeInTheDocument();
  });

  it("deletes a key only after the confirmation", async () => {
    keys = [{ id: "k1", name: "Old laptop", prefix: "dmk_Zz9999", createdAt: "2026-10-01T00:00:00.000Z", lastUsedAt: null }];
    const user = userEvent.setup();
    renderWithQuery(<ApiKeysPanel />);

    await user.click(await screen.findByRole("button", { name: "Delete Old laptop" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("Old laptop")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/api-keys/k1", { method: "DELETE" });
  });
});
