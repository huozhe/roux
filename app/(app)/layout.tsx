import { AppNav } from "@/components/nav/AppNav";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg)",
      }}
    >
      <AppNav />
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
