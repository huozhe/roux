import { notFound } from "next/navigation";
import { RecipeDetail } from "@/components/recipe/RecipeDetail";
import { TooManyRequests } from "@/components/share/TooManyRequests";
import { guestReadAllowed } from "@/lib/guest-rate-limit";
import { getSharedLibraryRecipe } from "@/lib/recipes/queries";
import { DEFAULT_PREFS } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SharedRecipePage({
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
    <RecipeDetail
      recipe={access.recipe}
      prefs={DEFAULT_PREFS}
      role="guest"
      basePath={`/s/${token}`}
    />
  );
}
