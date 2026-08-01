import { notFound } from "next/navigation";
import { RecipeDetail } from "@/components/recipe/RecipeDetail";
import { auth } from "@/lib/auth";
import { getRecipe } from "@/lib/data/recipes";
import { resolveAppUserId } from "@/lib/recipes/auth";
import { getUserPrefs } from "@/lib/recipes/queries";
import { DEFAULT_PREFS } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  let prefs = DEFAULT_PREFS;
  const session = await auth().catch(() => null);
  const userId = await resolveAppUserId(session?.user?.id);
  if (userId && process.env.DATABASE_URL) {
    try {
      prefs = await getUserPrefs(userId);
    } catch {
      /* defaults */
    }
  }

  return <RecipeDetail recipe={recipe} prefs={prefs} />;
}
