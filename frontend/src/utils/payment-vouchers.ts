export const PAYMENT_VOUCHER_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

const PAYMENT_VOUCHER_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_PAYMENT_VOUCHER_IMAGES = 10;

export function appendPaymentVoucherImages(
  existingAttachmentCount: number,
  currentUploads: File[],
  selectedFiles: FileList | File[],
) {
  const selected = Array.from(selectedFiles);
  if (selected.some((file) => !PAYMENT_VOUCHER_IMAGE_TYPES.has(file.type.toLowerCase()))) {
    throw new Error("收款凭证仅支持 JPG、PNG 或 WebP 图片");
  }

  if (existingAttachmentCount + currentUploads.length + selected.length > MAX_PAYMENT_VOUCHER_IMAGES) {
    throw new Error(`每条记录最多上传 ${MAX_PAYMENT_VOUCHER_IMAGES} 张收款凭证`);
  }

  return [...currentUploads, ...selected];
}
