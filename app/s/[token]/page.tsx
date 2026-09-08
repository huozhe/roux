import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LibraryClient } from "@/components/library/LibraryClient";
import { getSharedLibrary } from "@/lib/recipes/queries";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "Shared library · Roux",
};

/** Guest shelf: the owner's live library, read-only, no account needed. */
export default async function SharedLibraryPage({ params }: PageProps) {
  const { token } = await params;
  if (!process.env.DATABASE_URL) notFound();

  const shared = await getSharedLibrary(token);
  if (!shared) notFound();

  const owner = shared.ownerName ?? shared.ownerEmail;
  const basePath = `/s/${token}`;

  return (
    <>
      <div
        style={{
          maxWidth: 1240,
          width: "100%",
          margin: "0 auto",
          padding: "26.4px 17.6px 0",
          fontSize: 13.5,
        }}
      >
        {owner}&apos;s cookbook. Notes stay private, and the owner can kill this
        link at any time.
      </div>
      <LibraryClient recipes={shared.recipes} readOnly basePath={basePath} />
    </>
  );
}
