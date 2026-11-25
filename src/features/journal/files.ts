/**
 * Where the kept meal photos live on a phone: one JPEG per photo in the app's own documents folder
 * (`meal-photos/<id>.jpg`, expo-file-system), which only this app can read. Never uploaded, never synced,
 * and not in the export. The web has its own copy of these four functions in ./files.web.ts (IndexedDB).
 * Every failure is answered quietly (false or null): a photo that could not be kept is simply not in the
 * journal, and the estimate is logged all the same.
 */
import { Directory, File, Paths } from 'expo-file-system';

function folder(): Directory {
  return new Directory(Paths.document, 'meal-photos');
}

function fileOf(id: string): File {
  return new File(folder(), `${id}.jpg`);
}

/** Whether photos can be kept here at all. */
export async function photosAvailable(): Promise<boolean> {
  return true;
}

/** Writes a photo's JPEG (base64, no data: prefix). */
export async function writePhoto(id: string, base64: string): Promise<boolean> {
  try {
    const dir = folder();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = fileOf(id);
    if (file.exists) file.delete();
    file.create();
    await file.write(base64, { encoding: 'base64' });
    return true;
  } catch (e) {
    console.warn('meal photo: could not keep it', e);
    return false;
  }
}

/** The address an image can be drawn from, or null when the file is not there. */
export async function photoUri(id: string): Promise<string | null> {
  try {
    const file = fileOf(id);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

export async function removePhoto(id: string): Promise<void> {
  try {
    const file = fileOf(id);
    if (file.exists) file.delete();
  } catch (e) {
    console.warn('meal photo: could not remove it', e);
  }
}

/** Removes every kept photo (erasing this device, or "Delete all meal photos"). */
export async function removeAllPhotos(): Promise<void> {
  try {
    const dir = folder();
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('meal photos: could not remove them', e);
  }
}
