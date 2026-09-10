import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureUserOrganization } from "@/lib/auth/session";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { signOut } from "@/app/actions/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await ensureUserOrganization(user.id, user.email);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex h-screen">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-4 sm:px-6 shrink-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate lg:hidden">
                ACET AI
              </p>
              <p className="text-xs sm:text-sm text-slate-500 truncate">
                {user.email}
              </p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="text-xs font-medium text-slate-600 hover:text-slate-900 transition px-2 py-1"
              >
                Sign out
              </button>
            </form>
          </header>
          <main className="flex-1 overflow-auto p-4 sm:p-6 pb-24 lg:pb-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
