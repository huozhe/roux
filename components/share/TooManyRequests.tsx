/** Shown when a guest IP trips the share-link throttle (SEC-5). */
export function TooManyRequests() {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "26.4px 17.6px 70px",
        display: "flex",
        flexDirection: "column",
        gap: 8.8,
      }}
    >
      <h1 style={{ fontSize: 38, margin: 0, textWrap: "pretty" }}>
        Too many requests
      </h1>
      <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
        This link is fine — you just opened a lot of pages quickly. Wait a
        minute and reload.
      </p>
    </div>
  );
}
