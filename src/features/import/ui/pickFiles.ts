/**
 * Let the person pick Garmin files and get their bytes, on iOS, Android and web.
 *
 * SDK 58: expo-document-picker's getDocumentAsync({ multiple: true }) returns
 * one asset per file. On iOS and Android the asset's uri points at a copy in
 * the cache directory (copyToCacheDirectory, the default), which expo-file-system's
 * File class reads with bytes(). On web the asset carries the browser File;
 * base64 is turned off so a large file is not also turned into a data URL.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export interface PickedFile {
  name: string;
  size: number;
  bytes: Uint8Array;
}

export interface PickResult {
  files: PickedFile[];
  /** Files the system gave us but that could not be read, with a plain reason. */
  failed: { name: string; message: string }[];
}

/** Garmin's formats have no registered MIME types on phones, so native pickers allow any file; web narrows by extension. */
const WEB_TYPES = ['.fit', '.tcx', '.gpx', '.csv', '.zip', '.gz'];

/** Null when the person cancelled. */
export async function pickGarminFiles(): Promise<PickResult | null> {
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
      out.files.push({ name: asset.name, size: asset.size ?? 0, bytes: await readAsset(asset) });
    } catch {
      out.failed.push({ name: asset.name, message: 'This file could not be opened. Try saving it to the device first, then choose it again.' });
    }
  }
  return out;
}

async function readAsset(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    if (asset.file) return new Uint8Array(await asset.file.arrayBuffer());
    const r = await fetch(asset.uri);
    return new Uint8Array(await r.arrayBuffer());
  }
  return await new File(asset.uri).bytes();
}
