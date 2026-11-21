export const MAX_VEHICLE_PHOTO_SIZE = 5 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export const VEHICLE_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

export const VEHICLE_PHOTO_ERROR = 'Selecione uma imagem JPG, PNG ou WebP de até 5 MB.';

export function vehiclePhotoError(file: File): string | null {
  const dot = file.name.lastIndexOf('.');
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (IMAGE_TYPES[extension] !== file.type || file.size > MAX_VEHICLE_PHOTO_SIZE) {
    return VEHICLE_PHOTO_ERROR;
  }
  return null;
}
