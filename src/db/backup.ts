/**
 * Back up the database now: `npm run backup` (in Docker: `docker compose exec worker npm run backup`).
 * The worker also does this every night when BACKUP_DIR is set; see deploy/README.md → Backups.
 */
import 'dotenv/config';
import { pool } from './index';
import { backupConfig, runBackup } from '../server/services/backup';

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  const config = backupConfig();
  const result = await runBackup('manual', { config });
  if (result.status === 'busy') {
    console.error('✖ A backup is already running. Try again in a few minutes.');
    process.exitCode = 1;
    return;
  }
  for (const file of result.files) console.log(`  ${file.kind === 'database' ? 'Database' : 'Uploads '}  ${config.dir}/${file.name}  (${mb(file.bytes)})`);
  if (result.offsite) console.log(result.offsite.ok ? `  Off-site  copied to ${result.offsite.target}` : `  Off-site  ✖ not copied: ${result.offsite.error}`);
  if (result.removed.length) console.log(`  Removed   ${result.removed.length} backup file(s) older than ${config.keepDays} days`);
  if (result.status === 'failed') {
    console.error(`✖ Backup failed: ${result.error}`);
    process.exitCode = 1;
  } else console.log(`✔ Backup done`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
