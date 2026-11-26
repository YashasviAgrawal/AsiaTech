'use server';

import { z } from 'zod';
import { actionContext } from '../context';
import { runAction } from '../action';
import { UserError } from '../errors';
import type { Permission } from '../auth/permissions';
import { saveImage, type Folder } from '../storage';

const UPLOAD_PERMISSION: Record<Folder, Permission> = {
  ids: 'frontdesk.checkin',
  bills: 'money.manage',
  rooms: 'rooms.manage',
  branding: 'settings.manage',
};

const folderSchema = z.enum(['ids', 'bills', 'rooms', 'branding']);

/** Upload one image (already downscaled in the browser) and get back its URL. */
export async function uploadImageAction(formData: FormData) {
  return runAction(async () => {
    const folder = folderSchema.parse(formData.get('folder'));
    const ctx = await actionContext(UPLOAD_PERMISSION[folder]);
    const file = formData.get('file');
    if (!(file instanceof File)) throw new UserError('Choose a photo.');
    return { url: await saveImage(ctx.propertyId, folder, file) };
  });
}
