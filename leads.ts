"use server";

import { revalidatePath } from "next/cache";
import { createOutreachDrafts } from "@/services/outreach";
import { isAppError } from "@/lib/errors";

export async function prepareOutreach(leadIds: string[]) {
  try {
    const result = await createOutreachDrafts(leadIds);
    revalidatePath("/dashboard/approvals");
    revalidatePath("/dashboard");
    return { ok: true as const, ...result };
  } catch (err) {
    if (isAppError(err)) {
      return { ok: false as const, error: err.userMessage };
    }
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Failed to prepare outreach",
    };
  }
}
