import { describe, expect, it } from 'vitest';
import { backupConfig, backupStamp, filesToPrune, lastSlot } from '../src/server/services/backup';

describe('backups', () => {
  it('names files by India time', () => {
    expect(backupStamp(new Date('2026-11-25T21:30:00Z'))).toBe('2026-11-26-0300');
    expect(backupStamp(new Date('2026-11-26T05:07:00Z'))).toBe('2026-11-26-1037');
  });

  it('finds the last nightly slot (03:00 India time by default)', () => {
    // 10:30 in India: tonight's slot has not come yet, so the last one was this morning at 03:00.
    expect(lastSlot(new Date('2026-11-26T05:00:00Z'), 3).toISOString()).toBe('2026-11-25T21:30:00.000Z');
    // 02:00 in India: before 03:00, so the last slot was yesterday's.
    expect(lastSlot(new Date('2026-11-25T20:30:00Z'), 3).toISOString()).toBe('2026-11-24T21:30:00.000Z');
  });

  it('keeps the last N days and always the newest of each kind', () => {
    const names = ['hotel_os-2026-11-01-0300.dump', 'hotel_os-2026-11-12-0300.dump', 'hotel_os-2026-11-13-0300.dump', 'hotel_os-2026-11-13-0300-2.dump', 'uploads-2026-11-01-0300.tar.gz', 'notes.txt', 'hotel_os-2026-11-26-0300.dump.partial'];
    // Keeping 14 days on 26 Nov keeps 13 Nov onwards.
    expect(filesToPrune(names, '2026-11-26', 14)).toEqual(['hotel_os-2026-11-01-0300.dump', 'hotel_os-2026-11-12-0300.dump']);
    // The only uploads archive is old but stays: deleting it would leave no copy of the photos at all.
    expect(filesToPrune(['uploads-2026-01-01-0300.tar.gz', 'hotel_os-2026-01-01-0300.dump'], '2026-11-26', 14)).toEqual([]);
  });

  it('reads its settings, nightly only when BACKUP_DIR is set', () => {
    expect(backupConfig({})).toMatchObject({ scheduled: false, hour: 3, keepDays: 14, offsite: null, offsiteProblem: null });
    expect(backupConfig({}).uploadsDir).toMatch(/\.data\/uploads$/);
    const docker = backupConfig({ BACKUP_DIR: '/data/backups', BACKUP_HOUR: '2', BACKUP_KEEP_DAYS: '30', STORAGE_DRIVER: 's3' });
    expect(docker).toMatchObject({ dir: '/data/backups', scheduled: true, hour: 2, keepDays: 30, uploadsDir: null });
    expect(backupConfig({ BACKUP_HOUR: '25', BACKUP_KEEP_DAYS: '0' })).toMatchObject({ hour: 3, keepDays: 14 });
    const offsite = backupConfig({ BACKUP_S3_BUCKET: 'hotel-backups', S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com', S3_BUCKET: 'hotel-files', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' }).offsite;
    expect(offsite).toMatchObject({ bucket: 'hotel-backups', forcePathStyle: true, region: 'auto' });
    // Half set up: the worker keeps running and every backup shows the copy as failed, with the reason.
    expect(backupConfig({ BACKUP_S3_BUCKET: 'hotel-backups' })).toMatchObject({
      offsite: null,
      offsiteProblem: { target: 'hotel-backups/backups/', error: 'BACKUP_S3_BUCKET needs S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.' },
    });
  });
});
