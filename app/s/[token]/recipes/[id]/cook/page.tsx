import { notFound } from "next/navigation";
import { CookMode } from "@/components/cook/CookMode";
import { TooManyRequests } from "@/components/share/TooManyRequests";
import { guestReadAllowed } from "@/lib/guest-rate-limit";
import { getSharedLibraryRecipe } from "@/lib/recipes/queries";
import { DEFAULT_PREFS } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SharedCookPage({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { token, id } = await params;
  if (!process.env.DATABASE_URL) notFound();
  if (!(await guestReadAllowed())) return <TooManyRequests />;

  const access = await getSharedLibraryRecipe(token, id);
  if (!access) notFound();

  return (
    <CookMode
      recipe={access.recipe}
      prefs={DEFAULT_PREFS}
      basePath={`/s/${token}`}
    />
  );
}
