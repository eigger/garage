import sharp from "sharp";
import convertHeic from "heic-convert";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;

export type ProcessedImage = { buffer: Buffer; mimeType: string; ext: string };

/**
 * 첨부파일로 올라온 이미지를 저장 전에 처리한다:
 * - HEIC/HEIF(아이폰 사진)는 JPEG로 변환 — 대부분의 브라우저가 HEIC를 인라인으로
 *   보여주지 못해 미리보기가 깨지는 문제를 해결한다.
 * - 긴 변을 1600px로 축소하고 품질 82로 재압축 — 원본(수 MB) 그대로 저장하지 않는다.
 * PDF 등 이미지가 아닌 파일은 건드리지 않는다 — 호출 전에 mimeType으로 분기할 것.
 */
export async function processImageForStorage(
  buffer: Buffer,
  mimeType: string,
): Promise<ProcessedImage> {
  let working: Buffer = buffer;
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    const converted = await convertHeic({ buffer, format: "JPEG", quality: 0.9 });
    working = Buffer.from(converted);
  }

  const resized = await sharp(working)
    .rotate() // EXIF Orientation 반영 (회전된 상태로 저장되는 것 방지)
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return { buffer: resized, mimeType: "image/jpeg", ext: ".jpg" };
}
