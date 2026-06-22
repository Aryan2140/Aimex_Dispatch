/*
# Storage buckets + RLS for photo uploads

Two PRIVATE buckets (files served only via signed URLs, never public):
- label-photos
- packaging-photos

Policies (on storage.objects):
- Authenticated users can INSERT/SELECT/DELETE objects in these buckets,
  scoped to a path prefix of their own user id (uid/...). This keeps one
  user from reading another user's photos.

No photos are ever stored on the user's device: the browser captures a
blob in memory, uploads it directly to Supabase Storage, then discards it.
*/
DROP POLICY IF EXISTS "label_photos_insert_own" ON storage.objects;
CREATE POLICY "label_photos_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'label-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "label_photos_select_own" ON storage.objects;
CREATE POLICY "label_photos_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'label-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "label_photos_delete_own" ON storage.objects;
CREATE POLICY "label_photos_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'label-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "packaging_photos_insert_own" ON storage.objects;
CREATE POLICY "packaging_photos_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'packaging-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "packaging_photos_select_own" ON storage.objects;
CREATE POLICY "packaging_photos_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'packaging-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "packaging_photos_delete_own" ON storage.objects;
CREATE POLICY "packaging_photos_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'packaging-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
