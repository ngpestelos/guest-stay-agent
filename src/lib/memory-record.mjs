/**
 * Pure, independently-testable allowlist for what may ever reach the KV
 * memory store. Rejects (never silently strips) any shape outside what
 * applyMemory() in public/policy.js actually produces — fails loudly on
 * drift instead of quietly dropping a field. Structurally keeps
 * model_chain_of_thought / raw tool traces / other-guest data unwritable:
 * only this exact shape can ever be passed to a KV put.
 */

const ALLOWED_KEYS = [
  "booking_id",
  "stay_version",
  "commitments",
  "offers_made",
  "offers_refused",
  "escalations",
  "channel_thread_id",
  "language"
];
const STRING_ARRAY_KEYS = ["commitments", "offers_made", "offers_refused"];
// applyMemory() (policy.js:297-309) injects `stage` into every escalation
// row before persisting — it never appears in fixture source data, so it
// must be explicitly allowed here or every real escalate-path write fails.
const ESCALATION_KEYS = ["id", "type", "summary", "stage"];

export function validateMemoryRecord(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  if (Object.keys(candidate).some((k) => !ALLOWED_KEYS.includes(k))) return null;
  if (typeof candidate.booking_id !== "string") return null;
  if (typeof candidate.stay_version !== "number") return null;
  if (typeof candidate.channel_thread_id !== "string") return null;
  if (typeof candidate.language !== "string") return null;
  for (const k of STRING_ARRAY_KEYS) {
    if (!Array.isArray(candidate[k]) || !candidate[k].every((v) => typeof v === "string")) {
      return null;
    }
  }
  if (!Array.isArray(candidate.escalations)) return null;
  for (const row of candidate.escalations) {
    if (!row || typeof row !== "object") return null;
    if (Object.keys(row).some((k) => !ESCALATION_KEYS.includes(k))) return null;
    if (typeof row.id !== "string" || typeof row.type !== "string" || typeof row.summary !== "string") {
      return null;
    }
    if ("stage" in row && typeof row.stage !== "string") return null;
  }
  return candidate;
}
