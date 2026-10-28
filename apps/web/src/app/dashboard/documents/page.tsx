import type { Metadata } from "next";
import { DocumentsTable } from "@/components/documents/documents-table";
import { UploadZone } from "@/components/documents/upload-zone";

export const metadata: Metadata = { title: "Documents · Deskmate" };

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-muted-foreground">
          The bot answers only from these. New uploads take a few seconds to become searchable.
        </p>
      </div>
      <UploadZone />
      <DocumentsTable />
    </div>
  );
}
