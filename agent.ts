"use server";

import { revalidatePath } from "next/cache";
import { runAgentObjective } from "@/services/agent-run";
import { decideApproval } from "@/services/approvals";

export async function submitAgentObjective(objective: string) {
  const result = await runAgentObjective({ objective });
  if (result.ok && result.run) {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/runs");
    revalidatePath(`/dashboard/runs/${result.run.id}`);
  }
  return result;
}

export async function approveAction(approvalId: string) {
  const result = await decideApproval(approvalId, "approved");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/runs");
  return result;
}

export async function rejectAction(approvalId: string) {
  const result = await decideApproval(approvalId, "rejected");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/runs");
  return result;
}
