import { api } from './api';

export function photoUrl(storagePath: string) {
  return api.getPhotoUrl(storagePath);
}

export async function uploadLabelPhoto(blob: Blob): Promise<string> {
  return api.photos.uploadLabel(blob);
}

export async function uploadPackagingPhoto(orderId: number | string, blob: Blob) {
  return api.photos.uploadPackaging(orderId, blob);
}

export async function listPackagingPhotos(orderId: number | string) {
  return api.photos.listPackaging(orderId);
}

export async function deletePackagingPhoto(photoId: number | string) {
  return api.photos.deletePackaging(photoId);
}
