import { notFound } from "next/navigation";
import { RecipeDetail } from "@/components/recipe/RecipeDetail";
import { auth } from "@/lib/auth";
import { resolveAppUserId } from "@/lib/recipes/auth";
import {
  getRecipeForViewer,
  getUserPrefs,
} from "@/lib/recipes/queries";
import { DEFAULT_PREFS } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth().catch(() => null);
  const userId = await resolveAppUserId(session?.user?.id);

  let prefs = DEFAULT_PREFS;
  let access: Awaited<ReturnType<typeof getRecipeForViewer>> = null;

  if (userId && process.env.DATABASE_URL) {
    try {
      prefs = await getUserPrefs(userId);
      access = await getRecipeForViewer(userId, id);
    } catch {
      /* fall through */
    }
  }

  if (!access) {
    // Fixture / no-DB demo path
    if (!process.env.DATABASE_URL) {
      const { getRecipe } = await import("@/lib/data/recipes");
      const recipe = await getRecipe(id);
      if (!recipe) notFound();
      return <RecipeDetail recipe={recipe} prefs={prefs} role="owner" />;
    }
    notFound();
  }

  return (
    <RecipeDetail recipe={access.recipe} prefs={prefs} role={access.role} />
  );
}
