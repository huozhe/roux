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

  // Fixture demo only when there is no database — never when DB is configured.
  if (!process.env.DATABASE_URL) {
    const { getRecipe } = await import("@/lib/data/recipes");
    const recipe = await getRecipe(id);
    if (!recipe) notFound();
    return <RecipeDetail recipe={recipe} prefs={DEFAULT_PREFS} role="owner" />;
  }

  if (!userId) notFound();

  let prefs = DEFAULT_PREFS;
  try {
    prefs = await getUserPrefs(userId);
  } catch {
    /* defaults — do not couple prefs failures to recipe visibility */
  }

  // Let access failures surface via error.tsx rather than a false 404
  const access = await getRecipeForViewer(userId, id);
  if (!access) notFound();

  return (
    <RecipeDetail recipe={access.recipe} prefs={prefs} role={access.role} />
  );
}
