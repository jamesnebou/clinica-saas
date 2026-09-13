import { commandEnv, runCommand } from "./backup-export.mjs";
import { integer, mainModule, requireValue } from "./core.mjs";

export async function backupHealth(env, { run = runCommand, now = Date.now() } = {}) {
  const ref = requireValue(env, "OPS_BACKUP_SOURCE_REF");
  if (!/^[a-z]{20}$/.test(ref)) throw new Error("ops_health_invalid_ref");
  for (const key of ["RESTIC_REPOSITORY", "RESTIC_PASSWORD", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) requireValue(env, key);
  const maxAgeHours = integer(env.OPS_BACKUP_MAX_AGE_HOURS, 14, 1, 168);
  const args = ["snapshots", "--json", "--host", "nexawi-export", "--tag", `nexawi-ops:${ref}`];
  const options = { env: commandEnv(env, "restic") };
  const snapshots = JSON.parse(await run("restic", args, options));
  const times = snapshots.filter((item) => item.hostname === "nexawi-export" && item.tags?.includes(`nexawi-ops:${ref}`))
    .map((item) => Date.parse(item.time)).filter((time) => Number.isFinite(time) && time <= now);
  if (!times.length) throw new Error("ops_backup_missing");
  const ageHours = (now - Math.max(...times)) / 3_600_000;
  if (ageHours > maxAgeHours) throw new Error("ops_backup_stale");
  await run("restic", ["check"], options);
  return { status: "recent_snapshot_metadata_checked", age_hours: ageHours, max_age_hours: maxAgeHours, full_restore: "not_proven" };
}

if (mainModule(import.meta.url)) {
  backupHealth(process.env).then((result) => console.log(JSON.stringify(result))).catch(() => {
    console.error("ops_backup_health_failed");
    process.exitCode = 1;
  });
}
