import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, inject, provide } from "vue";
import { ElMessage } from "element-plus";
import RentPaymentsView from "./RentPaymentsView.vue";
import { filesApi, receiptsApi, rentPaymentsApi, unitsApi } from "../api";
import type { Contract, RentPayment, UnitSummary } from "../types/models";

vi.mock("../api", () => ({
  filesApi: { upload: vi.fn() },
  receiptsApi: { create: vi.fn(), list: vi.fn() },
  rentPaymentsApi: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), list: vi.fn() },
  unitsApi: { list: vi.fn() },
}));

vi.mock("element-plus", () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}));

vi.mock("../components/AppShell.vue", () => ({
  default: defineComponent({
    setup(_, { slots }) {
      return () => h("div", [slots["top-actions"]?.(), slots.default?.()]);
    },
  }),
}));

vi.mock("../composables/useViewportWidth", () => ({
  useViewportWidth: () => ({ value: 1280 }),
}));

const contract = {
  id: "contract-1",
  unitId: "unit-1",
  lessorName: "出租方",
  lessorLicenseCode: "license",
  lessorContactName: "联系人",
  lessorPhone: "13800000000",
  tenantName: "租户",
  contactName: "租户",
  tenantPhone: "13900000000",
  licenseCode: "",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  annualRent: 12000,
  depositAmount: 1000,
  paidAmount: 0,
  outstandingAmount: 12000,
  status: "active",
  businessLicenseFileId: null,
  businessLicenseFile: null,
  attachmentFiles: [],
} satisfies Contract;

const unit = {
  id: "unit-1",
  code: "A1",
  location: "测试厂房",
  area: 100,
  status: "occupied",
  activeContract: contract,
  contractCount: 1,
  contracts: [contract],
  meterConfigs: [],
} satisfies UnitSummary;

const existingPayment = {
  id: "payment-1",
  unitId: "unit-1",
  contractId: "contract-1",
  tenantNameSnapshot: "租户",
  paymentDate: "2026-08-01",
  amount: 1000,
  method: "转账",
  note: "",
  attachmentFiles: [
    {
      id: "existing-1",
      originalName: "existing.png",
      mimeType: "image/png",
      size: 1,
      category: "payment-voucher",
      storagePath: "payment-voucher/existing.png",
    },
  ],
  unit,
  contract,
} satisfies RentPayment;

function passthroughStub(tag = "div") {
  return defineComponent({
    props: ["modelValue"],
    emits: ["update:modelValue"],
    setup(_, { attrs, emit, slots }) {
      return () => h(tag, { ...attrs, onUpdateModelValue: (value: unknown) => emit("update:modelValue", value) }, [slots.default?.(), slots.footer?.()]);
    },
  });
}

const dialogStub = defineComponent({
  props: ["modelValue"],
  setup(props, { attrs, slots }) {
    return () => (props.modelValue ? h("div", attrs, [slots.default?.(), slots.footer?.()]) : null);
  },
});

const paymentVoucherUploadStub = defineComponent({
  name: "PaymentVoucherUpload",
  props: ["modelValue", "existingFiles", "disabled"],
  emits: ["update:modelValue", "remove-existing"],
  setup() {
    return () => h("div", { "data-test": "payment-voucher-upload" });
  },
});

function mountView() {
  const tableRowsKey = Symbol("tableRows");
  type TableRowsContext = { getRows: () => unknown[] };

  return mount(RentPaymentsView, {
    global: {
      directives: { loading: {} },
      stubs: {
        "el-button": defineComponent({
          props: ["loading"],
          emits: ["click"],
          setup(props, { attrs, emit, slots }) {
            return () => h("button", { ...attrs, disabled: props.loading, onClick: () => emit("click") }, slots.default?.());
          },
        }),
        "el-dialog": dialogStub,
        "el-form": passthroughStub("form"),
        "el-form-item": passthroughStub(),
        "el-row": passthroughStub(),
        "el-col": passthroughStub(),
        "el-space": passthroughStub(),
        "el-select": passthroughStub("select"),
        "el-option": defineComponent({ setup: () => () => null }),
        "el-input": passthroughStub("input"),
        "el-input-number": passthroughStub("input"),
        "el-date-picker": passthroughStub("input"),
        "el-tag": passthroughStub("span"),
        "el-table": defineComponent({
          props: ["data"],
          setup(props, { slots }) {
            provide<TableRowsContext>(tableRowsKey, { getRows: () => (Array.isArray(props.data) ? props.data : []) });
            return () => h("div", slots.default?.());
          },
        }),
        "el-table-column": defineComponent({
          props: ["prop"],
          setup(props, { slots }) {
            const table = inject<TableRowsContext>(tableRowsKey, { getRows: () => [] });
            return () => h("div", table.getRows().map((row) => slots.default?.({ row }) ?? h("span", String((row as Record<string, unknown>)[props.prop as string] ?? ""))));
          },
        }),
        PaymentVoucherPreviewDialog: true,
        PaymentVoucherUpload: paymentVoucherUploadStub,
      },
    },
  });
}

function findButton(wrapper: ReturnType<typeof mountView>, text: string) {
  const button = wrapper.findAll("button").find((item) => item.text() === text);
  expect(button, `expected button ${text}`).toBeTruthy();
  return button!;
}

function uploader(wrapper: ReturnType<typeof mountView>) {
  return wrapper.findComponent(paymentVoucherUploadStub);
}

describe("RentPaymentsView 收款凭证", () => {
  beforeEach(() => {
    vi.mocked(unitsApi.list).mockResolvedValue([unit]);
    vi.mocked(rentPaymentsApi.list).mockResolvedValue([]);
    vi.mocked(receiptsApi.list).mockResolvedValue([]);
    vi.mocked(rentPaymentsApi.create).mockResolvedValue(existingPayment);
    vi.mocked(rentPaymentsApi.update).mockResolvedValue(existingPayment);
    vi.mocked(filesApi.upload).mockResolvedValue([
      { id: "uploaded-1", originalName: "one.png", mimeType: "image/png", size: 1, category: "payment-voucher", storagePath: "payment-voucher/one.png" },
      { id: "uploaded-2", originalName: "two.webp", mimeType: "image/webp", size: 1, category: "payment-voucher", storagePath: "payment-voucher/two.webp" },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("创建时先上传待处理凭证，再使用上传后的 ID 创建房租收费", async () => {
    const pngFile = new File(["one"], "one.png", { type: "image/png" });
    const webpFile = new File(["two"], "two.webp", { type: "image/webp" });
    const wrapper = mountView();
    await flushPromises();

    await findButton(wrapper, "新增房租收费").trigger("click");
    await uploader(wrapper).vm.$emit("update:modelValue", [pngFile, webpFile]);
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(filesApi.upload).toHaveBeenCalledWith([pngFile, webpFile], "payment-voucher");
    expect(rentPaymentsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentFileIds: ["uploaded-1", "uploaded-2"] }),
    );
  });

  it("编辑时移除已有凭证，只提交新上传凭证的 ID", async () => {
    vi.mocked(rentPaymentsApi.list).mockResolvedValue([existingPayment]);
    vi.mocked(filesApi.upload).mockResolvedValue([
      { id: "uploaded-new", originalName: "new.png", mimeType: "image/png", size: 1, category: "payment-voucher", storagePath: "payment-voucher/new.png" },
    ]);
    const pngFile = new File(["new"], "new.png", { type: "image/png" });
    const wrapper = mountView();
    await flushPromises();

    await findButton(wrapper, "编辑").trigger("click");
    await uploader(wrapper).vm.$emit("remove-existing", "existing-1");
    await uploader(wrapper).vm.$emit("update:modelValue", [pngFile]);
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(filesApi.upload).toHaveBeenCalledWith([pngFile], "payment-voucher");
    expect(rentPaymentsApi.update).toHaveBeenCalledWith(
      "payment-1",
      expect.objectContaining({ attachmentFileIds: ["uploaded-new"] }),
    );
  });
});
