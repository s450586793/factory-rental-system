import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { ElMessage } from "element-plus";
import { contractsApi, filesApi } from "../../../api";
import type { Contract, StoredFile } from "../../../types/models";
import SignedContractUploadDialog from "./SignedContractUploadDialog.vue";

vi.mock("../../../api", () => ({ contractsApi: { addAttachments: vi.fn() }, filesApi: { upload: vi.fn() } }));
vi.mock("element-plus", () => ({ ElMessage: { success: vi.fn(), error: vi.fn() } }));
enableAutoUnmount(afterEach);

const existing = { id: "old", originalName: "old.pdf", category: "contract-attachment", mimeType: "application/pdf" } as StoredFile;
const contract = { id: "contract", tenantName: "测试租户", startDate: "2026-09-01", endDate: "2029-08-31", attachmentFiles: [existing] } as Contract;
const pdf = new File(["pdf"], "签字合同.pdf", { type: "application/pdf" });
const photo = new File(["photo"], "签字照片.png", { type: "image/png" });

function mountDialog() {
  return mount(SignedContractUploadDialog, {
    props: { contract },
    global: { stubs: {
      "el-dialog": defineComponent({ setup(_, { slots }) { return () => h("div", [slots.default?.(), slots.footer?.()]); } }),
      "el-button": defineComponent({
        props: ["loading", "disabled"],
        setup(props, { attrs, slots }) { return () => h("button", { ...attrs, disabled: props.loading || props.disabled }, slots.default?.()); },
      }),
    } },
  });
}

function button(wrapper: ReturnType<typeof mountDialog>, label: string) {
  return wrapper.findAll("button").find((item) => item.text() === label)!;
}

describe("已签合同补传", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(filesApi.upload).mockResolvedValue([{ ...existing, id: "new-pdf" }, { ...existing, id: "new-photo" }]);
    vi.mocked(contractsApi.addAttachments).mockResolvedValue(contract);
  });

  it("点击或键盘选择、拖入 PDF 和照片后保存，已有附件可预览", async () => {
    const wrapper = mountDialog();
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    const dropzone = wrapper.get('[aria-label="选择已签合同文件"]');
    await dropzone.trigger("keydown", { key: "Enter" });
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, "files", { value: [pdf], configurable: true });
    await input.trigger("change");
    await dropzone.trigger("drop", { dataTransfer: { files: [photo, pdf] } });
    expect(wrapper.findAll("li")).toHaveLength(2);
    await button(wrapper, "old.pdf").trigger("click");
    expect(wrapper.emitted("preview")?.[0]).toEqual([existing]);
    await button(wrapper, "保存附件").trigger("click");
    await flushPromises();
    expect(filesApi.upload).toHaveBeenCalledWith([pdf, photo], "contract-attachment");
    expect(contractsApi.addAttachments).toHaveBeenCalledWith("contract", ["new-pdf", "new-photo"]);
    expect(wrapper.emitted("saved")).toHaveLength(1);
  });

  it("关联失败后保留选择并复用已上传的文件重试", async () => {
    vi.mocked(filesApi.upload).mockResolvedValue([{ ...existing, id: "new-pdf" }]);
    vi.mocked(contractsApi.addAttachments).mockRejectedValueOnce(new Error("暂时不可用")).mockResolvedValue(contract);
    const wrapper = mountDialog();
    await wrapper.get('[role="button"]').trigger("drop", { dataTransfer: { files: [pdf] } });
    await button(wrapper, "保存附件").trigger("click");
    await flushPromises();
    expect(ElMessage.error).toHaveBeenCalledWith("暂时不可用");
    expect(wrapper.emitted("saved")).toBeUndefined();
    expect(wrapper.text()).toContain(pdf.name);
    await button(wrapper, "保存附件").trigger("click");
    await flushPromises();
    expect(filesApi.upload).toHaveBeenCalledOnce();
    expect(contractsApi.addAttachments).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted("saved")).toHaveLength(1);
  });

  it("上传失败后可以重试，取消不会提交", async () => {
    vi.mocked(filesApi.upload).mockRejectedValueOnce(new Error("上传失败")).mockResolvedValue([{ ...existing, id: "new-pdf" }]);
    const wrapper = mountDialog();
    await wrapper.get('[role="button"]').trigger("drop", { dataTransfer: { files: [pdf] } });
    await button(wrapper, "保存附件").trigger("click");
    await flushPromises();
    expect(contractsApi.addAttachments).not.toHaveBeenCalled();
    await button(wrapper, "保存附件").trigger("click");
    await flushPromises();
    expect(contractsApi.addAttachments).toHaveBeenCalledOnce();
    await button(wrapper, "取消").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("拒绝错误格式、超限文件，允许移除待上传文件", async () => {
    const wrapper = mountDialog();
    const oversized = new File(["large"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: 26 * 1024 * 1024 });
    for (const files of [[new File(["bad"], "x.html", { type: "text/html" })], [oversized],
      Array.from({ length: 11 }, (_, i) => new File(["x"], `${i}.pdf`, { type: "application/pdf" }))]) {
      await wrapper.get('[role="button"]').trigger("drop", { dataTransfer: { files } });
      expect(wrapper.findAll("li")).toHaveLength(0);
    }
    expect(ElMessage.error).toHaveBeenCalledTimes(3);
    await wrapper.get('[role="button"]').trigger("drop", { dataTransfer: { files: [pdf] } });
    await button(wrapper, "移除").trigger("click");
    expect(wrapper.findAll("li")).toHaveLength(0);
    expect(button(wrapper, "保存附件").attributes("disabled")).toBeDefined();
  });

  it("保存期间重复点击和拖拽不会重复上传或改变文件", async () => {
    let finish!: (value: StoredFile[]) => void;
    vi.mocked(filesApi.upload).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const wrapper = mountDialog();
    await wrapper.get('[role="button"]').trigger("drop", { dataTransfer: { files: [pdf] } });
    const save = button(wrapper, "保存附件");
    await Promise.all([save.trigger("click"), save.trigger("click")]);
    await wrapper.get('[role="button"]').trigger("drop", { dataTransfer: { files: [photo] } });
    expect(wrapper.findAll("li")).toHaveLength(1);
    expect(button(wrapper, "取消").attributes("disabled")).toBeDefined();
    expect(filesApi.upload).toHaveBeenCalledOnce();
    finish([{ ...existing, id: "new-pdf" }]);
    await flushPromises();
    expect(contractsApi.addAttachments).toHaveBeenCalledOnce();
  });
});
