/**
 * Let the person pick workout files and read them, on iOS, Android and web.
 *
 * Nothing is read when a file is picked: each file comes back as a ByteSource
 * (random access by offset), so a Health export of hundreds of megabytes is
 * never loaded whole. The session (session.ts) asks for what it needs: the end
 * of a ZIP and one entry's bytes for a Health export, or all the bytes of a
 * Garmin file (`readAll`, small files).
 *
 * SDK 58: expo-document-picker's getDocumentAsync({ multiple: true }) returns
 * one asset per file. On iOS and Android the asset's uri points at a copy in
 * the cache directory (copyToCacheDirectory, the default), which
 * expo-file-system's File opens as a FileHandle: `offset` to seek and
 * `readBytes(length)` to read (docs.expo.dev/versions/v58.0.0/sdk/filesystem,
 * FileHandle). On web the asset carries the browser File, read with
 * File.slice(...).arrayBuffer(); base64 is turned off so a large file is not
 * also turned into a data URL.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File, FileMode } from 'expo-file-system';
import { Platform } from 'react-native';

import { inFramedViewer, ViewerBlockedError } from '@/services/viewer';

import type { ByteSource } from '../zip';

export interface PickedFile {
  name: string;
  size: number;
  /** Random access to the file's bytes; nothing is read until asked. */
  source: ByteSource;
}

export interface PickResult {
  files: PickedFile[];
  /** Files the system gave us but that could not be read, with a plain reason. */
  failed: { name: string; message: string }[];
}

/** Garmin's formats and the Health export have no registered MIME types on phones, so native pickers allow any file; web narrows by extension. */
const WEB_TYPES = ['.fit', '.tcx', '.gpx', '.csv', '.zip', '.gz', '.xml'];

/** Null when the person cancelled. */
export async function pickGarminFiles(): Promise<PickResult | null> {
  // The hosted preview's frame blocks the file picker: say so rather than open nothing.
  if (inFramedViewer()) throw new ViewerBlockedError('files');
  const res = await DocumentPicker.getDocumentAsync({
    type: Platform.OS === 'web' ? WEB_TYPES : '*/*',
    multiple: true,
    copyToCacheDirectory: true,
    base64: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const out: PickResult = { files: [], failed: [] };
  for (const asset of res.assets) {
    try {
      const source = sourceOf(asset);
      out.files.push({ name: asset.name, size: source.size, source });
    } catch {
      out.failed.push({ name: asset.name, message: 'This file could not be opened. Try saving it to the device first, then choose it again.' });
    }
  }
  return out;
}

/** A browser File (or Blob) as a ByteSource. */
export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    read: async (offset, length) => new Uint8Array(await blob.slice(offset, Math.min(blob.size, offset + length)).arrayBuffer()),
  };
}

/** A file on the phone as a ByteSource: each read opens a handle, seeks, reads and closes it (reads are never interleaved on one handle). */
function nativeSource(uri: string): ByteSource {
  const file = new File(uri);
  const size = file.size;
  return {
    size,
    read: async (offset, length) => {
      const handle = file.open(FileMode.ReadOnly);
      try {
        handle.offset = offset;
        return await handle.readBytes(Math.min(length, Math.max(0, size - offset)));
      } finally {
        handle.close();
      }
    },
  };
}

function sourceOf(asset: DocumentPicker.DocumentPickerAsset): ByteSource {
  if (Platform.OS === 'web') {
    if (asset.file) return blobSource(asset.file);
    // No File object (an older picker): fetch once, then read from memory.
    let blob: Promise<Blob> | null = null;
    const get = () => (blob ??= fetch(asset.uri).then((r) => r.blob()));
    return {
      size: asset.size ?? 0,
      read: async (offset, length) => new Uint8Array(await (await get()).slice(offset, offset + length).arrayBuffer()),
    };
  }
  return nativeSource(asset.uri);
}

/** Every byte of a (small) file, for the Garmin readers. */
export async function readAll(source: ByteSource): Promise<Uint8Array> {
  return source.read(0, source.size);
}
