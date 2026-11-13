/**
 * AI meal analysis on the client: get a photo, shrink it, and send it (or a
 * description) to the analyze-food edge function.
 *
 * Cost: vision input is billed by pixel area, about one token per 28x28 px
 * patch. A camera original runs to many thousands of input tokens; resized to
 * 768 px on the long edge it costs about 750. The careful pass sends 1024 px.
 *
 * Without a backend, or without a signed-in user, analysis runs in sample
 * mode (see `@/features/ai/demo`) so the flow can be explored. Sample results
 * carry `demo: true` and the UI labels them as not based on the photo.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { aiError, postAnalyze, type AnalyzeRequest, type AnalyzeResponse, type AiErrorCode } from '@/features/ai/api';
import { DEMO_DELAY_MS, demoResult } from '@/features/ai/demo';
import { fitWithin, IMAGE_EDGE, JPEG_QUALITY } from '@/features/ai/image';

import { FUNCTIONS_URL, isBackendConfigured, supabase } from './supabase';

export { AiError, type AiErrorCode, type AnalyzeResponse } from '@/features/ai/api';

// ------------------------------------------------------------ images

export { IMAGE_EDGE };

export interface PickedPhoto {
  /** Original asset, kept so the careful pass can re-encode at a higher size. */
  uri: string;
  width: number;
  height: number;
}

export interface PreparedImage {
  /** Downscaled JPEG, for preview. */
  uri: string;
  /** Base64 JPEG without a data: prefix. */
  base64: string;
  width: number;
  height: number;
}

export class PhotoError extends Error {
  constructor(
    public code: 'camera_denied' | 'unreadable',
    message: string,
  ) {
    super(message);
    this.name = 'PhotoError';
  }
}

/**
 * Let the user take or choose a photo. Returns null when they cancel.
 * On web, "camera" opens the file picker with capture, which phones turn into
 * the camera and desktop browsers into a normal file dialog.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    // We re-encode right after, so skip a lossy pass here.
    quality: 1,
    exif: false,
  };
  if (source === 'camera') {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        throw new PhotoError('camera_denied', 'Camera access is off for HealthCal. Allow it in Settings, or choose a photo from your library.');
      }
    }
    const res = await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.back });
    return res.canceled || !res.assets?.[0] ? null : toPicked(res.assets[0]);
  }
  const res = await ImagePicker.launchImageLibraryAsync(options);
  return res.canceled || !res.assets?.[0] ? null : toPicked(res.assets[0]);
}

function toPicked(a: ImagePicker.ImagePickerAsset): PickedPhoto {
  return { uri: a.uri, width: a.width ?? 0, height: a.height ?? 0 };
}

/** Downscale to the long-edge limit and encode as JPEG. */
export async function prepareImage(photo: PickedPhoto, opts: { precise?: boolean } = {}): Promise<PreparedImage> {
  const edge = opts.precise ? IMAGE_EDGE.precise : IMAGE_EDGE.fast;
  try {
    // Decoding with a bound keeps a 12-megapixel original out of memory on phones.
    let ref = await ImageManipulator.ImageManipulator.manipulate(photo.uri, { maxWidth: edge, maxHeight: edge }).renderAsync();
    if (Math.max(ref.width, ref.height) > edge) {
      // Some platforms only downsample by powers of two while decoding; finish the job exactly.
      const target = fitWithin(ref.width, ref.height, edge);
      ref = await ImageManipulator.ImageManipulator.manipulate(ref).resize({ width: target.width }).renderAsync();
    }
    const saved = await ref.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
    if (!saved.base64) throw new Error('no image data');
    return { uri: saved.uri, base64: saved.base64.replace(/^data:[^,]*,/, ''), width: saved.width, height: saved.height };
  } catch {
    throw new PhotoError('unreadable', 'That photo could not be read. Try another one.');
  }
}

// ------------------------------------------------------------ analysis

export interface AnalyzeOptions {
  signal?: AbortSignal;
  /** Development only: make a sample analysis fail with this code. */
  demoError?: AiErrorCode;
}

export function isAiLive(signedIn: boolean): boolean {
  return isBackendConfigured && signedIn;
}

const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Estimate a meal from a photo and/or description. Returns the result and the
 * analyses left today. Throws `AiError` with a human message and whether a
 * retry makes sense. Falls back to a labelled sample when analysis is not
 * available (no backend, or nobody signed in).
 */
export async function analyzeFood(input: AnalyzeRequest, opts: AnalyzeOptions = {}): Promise<AnalyzeResponse> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (!supabase || !session) return analyzeDemo(opts);
  return postAnalyze(fetch, input, {
    functionsUrl: FUNCTIONS_URL,
    accessToken: session.access_token,
    anonKey,
    signal: opts.signal,
  });
}

async function analyzeDemo(opts: AnalyzeOptions): Promise<AnalyzeResponse> {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, DEMO_DELAY_MS);
    opts.signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    });
  });
  if (__DEV__ && opts.demoError) throw aiError(opts.demoError, undefined, opts.demoError === 'daily_limit' ? 0 : null);
  return { result: demoResult(), remaining: null };
}
