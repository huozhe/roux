import { redirect } from "next/navigation";

/** Unauthenticated users land on login until auth middleware lands (T1). */
export default function HomePage() {
  redirect("/login");
}
