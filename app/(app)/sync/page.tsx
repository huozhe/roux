import { SyncClient } from "@/components/sync/SyncClient";

export const metadata = {
  title: "Sync · Roux",
};

export default function SyncPage() {
  return (
    <div style={{ minHeight: "100%", background: "var(--color-bg)" }}>
      <SyncClient />
    </div>
  );
}
