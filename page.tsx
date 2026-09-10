import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgentRun } from "@/services/agent-run";
import { RunStepTimeline } from "@/components/runs/step-timeline";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const run = await getAgentRun(id);

  if (!run) {
    notFound();
  }

  const steps =
    Array.isArray(run.workflow_steps) && run.workflow_steps.length > 0
      ? run.workflow_steps
      : Array.isArray(run.steps)
        ? run.steps
        : [];

  const started = new Date(run.created_at).getTime();
  const ended = run.completed_at
    ? new Date(run.completed_at).getTime()
    : Date.now();
  const durationMs = ended - started;

  const completed = steps.filter((s: { status?: string }) => s.status === "completed").length;
  const total = steps.length;
  const progressLabel =
    total > 0
      ? `${completed} of ${total} steps complete`
      : run.status.replace(/_/g, " ");

  const approvals = Array.isArray(run.approvals) ? run.approvals : [];

  return (
    <div className="max-w-3xl pb-20 lg:pb-0">
      <div className="mb-6">
        <Link
          href="/dashboard/runs"
          className="text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          ← All runs
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-slate-900 tracking-tight">
          Agent run
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">{progressLabel}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                Objective
              </p>
              <p className="text-sm text-slate-800 leading-relaxed">
                {run.objective}
              </p>
            </div>
            <StatusBadge status={run.status} />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span>Started {new Date(run.created_at).toLocaleString()}</span>
            {run.completed_at && (
              <span>
                Completed {new Date(run.completed_at).toLocaleString()}
              </span>
            )}
            <span>
              Duration{" "}
              {durationMs < 1000
                ? `${durationMs}ms`
                : `${Math.round(durationMs / 1000)}s`}
            </span>
          </div>
        </div>

        {run.plan && (
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Plan
            </h2>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-mono">
              {run.plan}
            </p>
          </div>
        )}

        {run.result_summary && (
          <div className="px-5 py-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Outcome
            </h2>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {run.result_summary}
            </p>
          </div>
        )}
      </div>

      {approvals.length > 0 && (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">
            Approvals on this run
          </h2>
          <ul className="space-y-2">
            {approvals.map((a: { id: string; action_summary?: string; status?: string }) => (
              <li key={a.id} className="text-sm text-slate-700 flex items-center justify-between gap-2">
                <span>{a.action_summary ?? "Action"}</span>
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  {(a.status ?? "pending").replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/approvals"
            className="mt-2 inline-block text-xs font-medium text-acet-600 hover:underline"
          >
            Open approval center
          </Link>
        </section>
      )}

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Execution timeline
        </h2>
        <RunStepTimeline steps={steps} />
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    running: "bg-blue-50 text-blue-700 border-blue-200",
    planning: "bg-blue-50 text-blue-700 border-blue-200",
    waiting_for_approval: "bg-amber-50 text-amber-700 border-amber-200",
    awaiting_approval: "bg-amber-50 text-amber-700 border-amber-200",
    scheduled: "bg-violet-50 text-violet-700 border-violet-200",
    cancelled: "bg-slate-100 text-slate-600 border-slate-200",
    queued: "bg-slate-100 text-slate-600 border-slate-200",
  };
  const cls = styles[status] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
