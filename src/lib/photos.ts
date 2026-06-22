import { supabase, LABEL_BUCKET, PACKAGING_BUCKET } from './supabase';

// Upload an in-memory Blob to the user-scoped path in a storage bucket.
// Returns the storage path (bucket-relative) for later signed-URL retrieval.
export async function uploadPhoto(
  bucket: typeof LABEL_BUCKET | typeof PACKAGING_BUCKET,
  blob: Blob,
  ext = 'jpeg',
): Promise<string> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) throw new Error('Not signed in');
  const ts = Date.now();
  const path = `${uid}/${ts}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function signedUrl(
  bucket: typeof LABEL_BUCKET | typeof PACKAGING_BUCKET,
  path: string,
  expiresIn = 300,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function deletePhoto(
  bucket: typeof LABEL_BUCKET | typeof PACKAGING_BUCKET,
  path: string,
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
