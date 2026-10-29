import type { DocumentSummary } from "@deskmate/shared/documents";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jsonResponse, mockFetch, renderWithQuery } from "@/test/utils";

// Toasts are checked as calls: sonner's <Toaster> isn't rendered here, and what matters is what the user is told.
const toast = { success: jest.fn(), error: jest.fn() };
jest.mock("sonner", () => ({ toast }));

let UploadZone: typeof import("@/components/documents/upload-zone").UploadZone;
let DocumentsTable: typeof import("@/components/documents/documents-table").DocumentsTable;

const doc = (overrides: Partial<DocumentSummary>): DocumentSummary => ({
  id: "doc-1",
  title: "Pricing",
  sourceType: "text",
  status: "ready",
  chunkCount: 12,
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-20T10:00:05.000Z",
  ...overrides,
});

/** The documents page: both components share one query cache, as they do in the app. */
function renderPage() {
  return renderWithQuery(
    <>
      <UploadZone />
      <DocumentsTable />
    </>,
  );
}

describe("documents page", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeAll(async () => {
    ({ UploadZone } = await import("@/components/documents/upload-zone"));
    ({ DocumentsTable } = await import("@/components/documents/documents-table"));
  });

  beforeEach(() => {
    fetchMock = mockFetch();
    toast.success.mockClear();
    toast.error.mockClear();
  });

  /** A tiny fake API: answers by method and path, and records what was sent. */
  function serve(documents: DocumentSummary[]) {
    fetchMock.mockImplementation(async (input, init) => {
      const method = init?.method ?? "GET";
      if (method === "GET" && input === "/api/documents") return jsonResponse(200, documents);
      if (method === "POST" && input === "/api/documents") {
        const title = (init?.body as FormData).get("title") as string;
        return jsonResponse(202, doc({ id: "doc-new", title, status: "processing", chunkCount: 0 }));
      }
      if (method === "DELETE") return jsonResponse(204);
      throw new Error(`unexpected request: ${method} ${String(input)}`);
    });
  }

  it("lists documents with their status, chunk count and failure reason", async () => {
    serve([
      doc({}),
      doc({ id: "doc-2", title: "Old scan", status: "failed", chunkCount: 0, error: "No text found in this PDF." }),
    ]);
    renderPage();

    const pricing = (await screen.findByText("Pricing")).closest("tr") as HTMLElement;
    expect(within(pricing).getByText("Ready")).toBeInTheDocument();
    expect(within(pricing).getByText("12")).toBeInTheDocument();

    const failed = screen.getByText("Old scan").closest("tr") as HTMLElement;
    expect(within(failed).getByText("Failed")).toBeInTheDocument();
    expect(within(failed).getByText("No text found in this PDF.")).toBeInTheDocument();
  });

  it("shows an empty state when there are no documents", async () => {
    serve([]);
    renderPage();

    expect(await screen.findByText(/No documents yet/)).toBeInTheDocument();
  });

  it("shows the API's error and a retry button when the list fails to load", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "Database unavailable" }));
    renderPage();

    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("rejects an unsupported file in the browser, without uploading it", async () => {
    serve([]);
    // applyAccept: false lets the test pick a file the input's accept="" would hide, as drag-and-drop can.
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    await screen.findByText(/No documents yet/);

    await user.upload(screen.getByLabelText(/Drop files here/), new File(["png"], "logo.png", { type: "image/png" }));

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("logo.png: only"));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("uploads a file and shows it as processing right away", async () => {
    serve([doc({})]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Pricing");

    await user.upload(screen.getByLabelText(/Drop files here/), new File(["# Refunds"], "refund-policy.md"));

    const row = (await screen.findByText("refund-policy")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Processing")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("refund-policy.md uploaded. Processing…");

    const [, init] = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    const form = init!.body as FormData;
    expect(form.get("title")).toBe("refund-policy"); // extension dropped
    expect((form.get("file") as File).name).toBe("refund-policy.md");
  });

  it("deletes a document only after the confirmation", async () => {
    serve([doc({})]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete Pricing" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Delete “Pricing”?")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false); // not yet

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("Pricing")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/documents/doc-1", { method: "DELETE" });
    expect(toast.success).toHaveBeenCalledWith("Deleted Pricing");
  });
});
