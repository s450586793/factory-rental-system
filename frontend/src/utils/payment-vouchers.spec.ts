import { describe, expect, it } from "vitest";
import { appendPaymentVoucherImages, MAX_PAYMENT_VOUCHER_IMAGES } from "./payment-vouchers";

function imageFile(name: string, type = "image/png") {
  return new File(["image"], name, { type });
}

describe("appendPaymentVoucherImages", () => {
  it("keeps selected JPG, PNG, and WebP payment voucher images", () => {
    const current = [imageFile("first.png")];

    const result = appendPaymentVoucherImages(2, current, [imageFile("second.jpg", "image/jpeg")]);

    expect(result).toEqual([current[0], expect.objectContaining({ name: "second.jpg" })]);
  });

  it("rejects non-image payment voucher files", () => {
    expect(() => appendPaymentVoucherImages(0, [], [imageFile("receipt.pdf", "application/pdf")])).toThrow(
      "收款凭证仅支持 JPG、PNG 或 WebP 图片",
    );
  });

  it("rejects more than ten images for one payment record", () => {
    expect(() => appendPaymentVoucherImages(9, [], [imageFile("one.png"), imageFile("two.png")])).toThrow(
      "每条记录最多上传 10 张收款凭证",
    );
  });

  it("keeps current uploads when no files are selected", () => {
    const png = imageFile("receipt.png");

    expect(appendPaymentVoucherImages(1, [png], [])).toEqual([png]);
  });

  it("exports the maximum number of payment voucher images", () => {
    expect(MAX_PAYMENT_VOUCHER_IMAGES).toBe(10);
  });
});
