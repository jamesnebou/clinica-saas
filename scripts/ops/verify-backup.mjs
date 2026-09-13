import { mainModule, verifyArchive } from "./core.mjs";

if (mainModule(import.meta.url)) {
  if (!process.argv[2]) {
    console.error("ops_archive_directory_required");
    process.exitCode = 1;
  } else {
    verifyArchive(process.argv[2]).then((result) => console.log(JSON.stringify({ status: "verified", ...result }))).catch(() => {
      console.error("ops_archive_integrity_failed");
      process.exitCode = 1;
    });
  }
}
