import { extname } from 'node:path';
import { Actor, fail, MAX_PHOTO_BYTES } from '../../../packages/shared/src';

export function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Expected an object');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !fields.includes(key))) fail(400, 'Unexpected input field');
  return result;
}
export function id(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) fail(400, 'Invalid ID');
  return value;
}
export function actor(value: unknown): Actor {
  const data = object(value, ['id', 'employeeId', 'role']);
  id(data.id); id(data.employeeId);
  if (data.role !== 'HRD' && data.role !== 'EMPLOYEE') fail(403, 'Invalid actor role');
  return data as unknown as Actor;
}

export interface ValidPhoto { bytes: Buffer; mimeType: 'image/jpeg' | 'image/png'; extension: '.jpg' | '.png' }
/** Signature validation is not a full image decoder or malware scanner. */
export function validatePhoto(value: unknown): ValidPhoto {
  const photo = object(value, ['originalname', 'mimetype', 'buffer', 'size']);
  if (typeof photo.originalname !== 'string' || !photo.originalname.length || photo.originalname.length > 255) fail(400, 'Invalid photo filename');
  if (typeof photo.size !== 'number' || !Number.isInteger(photo.size) || photo.size < 1) fail(400, 'Invalid photo size');
  if (photo.size > MAX_PHOTO_BYTES) fail(413, 'Photo exceeds 5 MB');
  if (typeof photo.buffer !== 'string' || !photo.buffer.length) fail(400, 'Photo must be base64 encoded');
  if (photo.buffer.length > 4 * Math.ceil(MAX_PHOTO_BYTES / 3)) fail(413, 'Photo exceeds 5 MB');
  if (photo.buffer.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(photo.buffer)) fail(400, 'Invalid photo base64');
  const bytes = Buffer.from(photo.buffer, 'base64');
  if (bytes.toString('base64') !== photo.buffer || bytes.length !== photo.size) fail(400, 'Photo size or base64 mismatch');
  const extension = extname(photo.originalname).toLowerCase();
  const jpeg = photo.mimetype === 'image/jpeg' && ['.jpg', '.jpeg'].includes(extension)
    && bytes.length >= 6 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  const png = photo.mimetype === 'image/png' && extension === '.png' && bytes.length >= 45
    && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    && bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR'
    && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0
    && bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'));
  if (!jpeg && !png) fail(400, 'Photo must match JPEG or PNG MIME, extension and image signature');
  return { bytes, mimeType: jpeg ? 'image/jpeg' : 'image/png', extension: jpeg ? '.jpg' : '.png' };
}
