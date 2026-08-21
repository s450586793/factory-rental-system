import { mount } from "@vue/test-utils";
import { ElMessage } from "element-plus";
import { afterEach, describe, expect, it, vi } from "vitest";
import PaymentVoucherUpload from "./PaymentVoucherUpload.vue";

vi.mock("element-plus", () => ({
  ElMessage: {
    error: vi.fn(),
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

function imageFile(name: string, type = "image/png") {
  return new File(["image"], name, { type });
}

function mountUploader(options: { modelValue?: File[]; existingFiles?: Array<{ id: string; originalName: string }>; disabled?: boolean } = {}) {
  return mount(PaymentVoucherUpload, {
    props: {
      modelValue: options.modelValue ?? [],
      existingFiles: options.existingFiles ?? [{ id: "existing-1", originalName: "已上传凭证.png" }],
      disabled: options.disabled ?? false,
    },
    global: {
      stubs: {
        "el-button": {
          props: ["disabled"],
          template: "<button :disabled=\"disabled\"><slot /></button>",
        },
      },
    },
  });
}

describe("PaymentVoucherUpload", () => {
  it("opens the hidden file input by click and keyboard", async () => {
    const wrapper = mountUploader();
    const input = wrapper.get('input[type="file"]');
    const inputElement = input.element as HTMLInputElement;
    const click = vi.fn();
    inputElement.click = click;

    await wrapper.get(".payment-voucher-dropzone").trigger("click");
    await wrapper.get(".payment-voucher-dropzone").trigger("keydown", { key: "Enter" });
    await wrapper.get(".payment-voucher-dropzone").trigger("keydown", { key: " " });

    expect(click).toHaveBeenCalledTimes(3);
  });

  it("keeps the hidden native input out of the tab order", () => {
    const wrapper = mountUploader();

    expect(wrapper.get('input[type="file"]').attributes("tabindex")).toBe("-1");
    expect(wrapper.get(".payment-voucher-dropzone").attributes("tabindex")).toBe("0");
  });

  it("emits selected files from the native input and resets it", async () => {
    const pngFile = imageFile("receipt.png");
    const wrapper = mountUploader();
    const input = wrapper.get('input[type="file"]');
    const inputElement = input.element as HTMLInputElement;
    Object.defineProperty(inputElement, "files", { configurable: true, value: [pngFile] });

    await input.trigger("change");

    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toEqual([pngFile]);
    expect(inputElement.value).toBe("");
  });

  it("adds dropped files and exposes active drag styling", async () => {
    const pngFile = imageFile("receipt.png");
    const webpFile = imageFile("receipt.webp", "image/webp");
    const wrapper = mountUploader();
    const dropzone = wrapper.get(".payment-voucher-dropzone");

    await dropzone.trigger("dragenter");
    expect(dropzone.classes()).toContain("is-dragging");
    await dropzone.trigger("dragleave");
    expect(dropzone.classes()).not.toContain("is-dragging");

    await dropzone.trigger("drop", { dataTransfer: { files: [pngFile, webpFile] } });

    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toEqual([pngFile, webpFile]);
    expect(dropzone.classes()).not.toContain("is-dragging");
  });

  it("keeps drag styling while moving between dropzone children", async () => {
    const wrapper = mountUploader();
    const dropzone = wrapper.get(".payment-voucher-dropzone");
    const child = dropzone.get("span");

    await dropzone.trigger("dragenter");
    await child.trigger("dragenter");
    await child.trigger("dragleave");

    expect(dropzone.classes()).toContain("is-dragging");

    await dropzone.trigger("dragleave");
    expect(dropzone.classes()).not.toContain("is-dragging");
  });

  it("removes pending files", async () => {
    const pngFile = imageFile("receipt.png");
    const wrapper = mountUploader({ modelValue: [pngFile] });

    await wrapper.get('[data-pending-index="0"] button').trigger("click");

    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toEqual([]);
  });

  it("emits the existing file id when removing an existing file", async () => {
    const wrapper = mountUploader();

    await wrapper.get('[data-file-id="existing-1"] button').trigger("click");

    expect(wrapper.emitted("remove-existing")?.at(-1)).toEqual(["existing-1"]);
  });

  it("shows validation errors for unsupported image files and excessive files", async () => {
    const pdfFile = imageFile("receipt.pdf", "application/pdf");
    const wrapper = mountUploader();

    await wrapper.get(".payment-voucher-dropzone").trigger("drop", { dataTransfer: { files: [pdfFile] } });
    expect(ElMessage.error).toHaveBeenLastCalledWith("收款凭证仅支持 JPG、PNG 或 WebP 图片");

    const maxedWrapper = mountUploader({
      existingFiles: Array.from({ length: 9 }, (_, index) => ({ id: `existing-${index}`, originalName: `${index}.png` })),
    });
    await maxedWrapper.get(".payment-voucher-dropzone").trigger("drop", {
      dataTransfer: { files: [imageFile("one.png"), imageFile("two.png")] },
    });
    expect(ElMessage.error).toHaveBeenLastCalledWith("每条记录最多上传 10 张收款凭证");
  });

  it("ignores empty drops", async () => {
    const wrapper = mountUploader();

    await wrapper.get(".payment-voucher-dropzone").trigger("drop", { dataTransfer: { files: [] } });

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it("does not open, append, or remove files while disabled", async () => {
    const pngFile = imageFile("receipt.png");
    const wrapper = mountUploader({ modelValue: [pngFile], disabled: true });
    const input = wrapper.get('input[type="file"]');
    const inputElement = input.element as HTMLInputElement;
    const click = vi.fn();
    inputElement.click = click;

    await wrapper.get(".payment-voucher-dropzone").trigger("click");
    await wrapper.get(".payment-voucher-dropzone").trigger("keydown", { key: "Enter" });
    await wrapper.get(".payment-voucher-dropzone").trigger("drop", { dataTransfer: { files: [pngFile] } });
    await wrapper.get('[data-file-id="existing-1"] button').trigger("click");
    await wrapper.get('[data-pending-index="0"] button').trigger("click");

    expect(click).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("remove-existing")).toBeUndefined();
    expect(wrapper.get(".payment-voucher-dropzone").attributes("aria-disabled")).toBe("true");
  });

  it("clears drag styling and ignores drag events while disabled", async () => {
    const wrapper = mountUploader();
    const dropzone = wrapper.get(".payment-voucher-dropzone");

    await dropzone.trigger("dragenter");
    expect(dropzone.classes()).toContain("is-dragging");

    await wrapper.setProps({ disabled: true });
    await dropzone.trigger("dragenter");
    await dropzone.trigger("dragover");

    expect(dropzone.classes()).not.toContain("is-dragging");
  });
});
