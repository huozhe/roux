import { notFound } from "next/navigation";
import { CookMode } from "@/components/cook/CookMode";
import { auth } from "@/lib/auth";
import { resolveAppUserId } from "@/lib/recipes/auth";
import {
  getRecipeForViewer,
  getUserPrefs,
} from "@/lib/recipes/queries";
import { DEFAULT_PREFS } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth().catch(() => null);
  const userId = await resolveAppUserId(session?.user?.id);

  if (!process.env.DATABASE_URL) {
    const { getRecipe } = await import("@/lib/data/recipes");
    const recipe = await getRecipe(id);
    if (!recipe) notFound();
    return <CookMode recipe={recipe} prefs={DEFAULT_PREFS} />;
  }

  if (!userId) notFound();

  let prefs = DEFAULT_PREFS;
  try {
    prefs = await getUserPrefs(userId);
  } catch {
    /* defaults */
  }

  const access = await getRecipeForViewer(userId, id);
  if (!access) notFound();

  return <CookMode recipe={access.recipe} prefs={prefs} />;
}
