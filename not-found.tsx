import Link from "next/link";

export default function RunNotFound() {
  return (
    <div className="max-w-md mx-auto text-center py-20">
      <h1 className="text-lg font-semibold text-slate-900">Run not found</h1>
      <p className="mt-2 text-sm text-slate-500">
        This agent run does not exist or you do not have access to it.
      </p>
      <Link
        href="/dashboard/runs"
        className="mt-6 inline-block text-sm font-medium text-acet-600 hover:text-acet-700"
      >
        ← Back to runs
      </Link>
    </div>
  );
}
