import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, inject, provide } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import RentPaymentsView from "./RentPaymentsView.vue";
import PaymentVoucherUpload from "../components/PaymentVoucherUpload.vue";
import { filesApi, receiptsApi, rentPaymentsApi, rentReceivablesApi, unitsApi } from "../api";
import type { Contract, Receipt, RentPayment, UnitSummary } from "../types/models";

vi.mock("../api", () => ({
  filesApi: { upload: vi.fn() },
  receiptsApi: { create: vi.fn(), list: vi.fn() },
  rentPaymentsApi: {
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
    previewAllocation: vi.fn(),
  },
  rentReceivablesApi: { list: vi.fn() },
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
  lessorSafetyManager: "联系人",
  tenantName: "租户",
  contactName: "租户",
  tenantPhone: "13900000000",
  licenseCode: "",
  tenantSafetyManager: "租户",
  signedDate: "2026-01-01",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  annualRent: 12000,
  depositAmount: 1000,
  electricUnitPrice: 0.95,
  electricLineLossPercent: 5,
  waterUnitPrice: 1,
  earlyTerminationPenaltyAmount: 1000,
  billingFrequency: "annual",
  depositSettlementMode: "initial",
  depositCarryoverAmount: 0,
  depositCarryoverSourceContractId: null,
  dueReceivableAmount: 12000,
  duePaidAmount: 0,
  outstandingAmount: 12000,
  prepaidAmount: 0,
  unallocatedAmount: 0,
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

const paymentMutationResult = {
  payment: existingPayment,
  allocations: [],
  unallocatedAmount: 0,
};

const activeReceipt = {
  id: "receipt-1",
  receiptNo: "R202608001",
  sourceType: "rent-payment",
  sourceId: "payment-1",
  tenantNameSnapshot: "租户",
  unitCodeSnapshot: "A1",
  amountSnapshot: 1000,
  issueDate: "2026-08-01",
  summary: "房租",
  pdfFileId: "receipt-file-1",
  pdfFile: {
    id: "receipt-file-1",
    originalName: "receipt.pdf",
    mimeType: "application/pdf",
    size: 1,
    category: "receipt",
    storagePath: "receipt/receipt.pdf",
  },
  status: "active",
  voidedAt: null,
} satisfies Receipt;

function passthroughStub(tag = "div") {
  return defineComponent({
    props: ["modelValue"],
    emits: ["update:modelValue"],
    setup(props, { attrs, emit, slots }) {
      return () => h(tag, {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).value),
        onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).value),
        onUpdateModelValue: (value: unknown) => emit("update:modelValue", value),
      }, [slots.default?.(), slots.footer?.()]);
    },
  });
}

const dialogStub = defineComponent({
  props: ["modelValue"],
  setup(props, { attrs, slots }) {
    return () => (props.modelValue ? h("div", attrs, [slots.default?.(), slots.footer?.()]) : null);
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
        "el-tabs": passthroughStub(),
        "el-tab-pane": passthroughStub(),
        "el-tooltip": passthroughStub("span"),
        "el-select": passthroughStub("select"),
        "el-option": defineComponent({
          props: ["label", "value"],
          setup(props) {
            return () => h("option", { value: props.value }, props.label);
          },
        }),
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
  return wrapper.findComponent(PaymentVoucherUpload);
}

describe("RentPaymentsView 收款凭证", () => {
  beforeEach(() => {
    vi.mocked(unitsApi.list).mockResolvedValue([unit]);
    vi.mocked(rentPaymentsApi.list).mockResolvedValue([]);
    vi.mocked(receiptsApi.list).mockResolvedValue([]);
    vi.mocked(rentReceivablesApi.list).mockResolvedValue({ items: [] });
    vi.mocked(rentPaymentsApi.previewAllocation).mockResolvedValue({ allocations: [], unallocatedAmount: 0 });
    vi.mocked(rentPaymentsApi.create).mockResolvedValue(paymentMutationResult);
    vi.mocked(rentPaymentsApi.update).mockResolvedValue(paymentMutationResult);
    vi.mocked(rentPaymentsApi.remove).mockResolvedValue(paymentMutationResult);
    vi.mocked(receiptsApi.create).mockResolvedValue(activeReceipt);
    vi.mocked(ElMessageBox.confirm).mockResolvedValue({} as Awaited<ReturnType<typeof ElMessageBox.confirm>>);
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
    expect(vi.mocked(filesApi.upload).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(rentPaymentsApi.create).mock.invocationCallOrder[0],
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

  it("支持拖拽图片和点击选择按钮添加待上传凭证", async () => {
    const pngFile = new File(["one"], "one.png", { type: "image/png" });
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");
    const wrapper = mountView();
    await flushPromises();
    await findButton(wrapper, "新增房租收费").trigger("click");

    const dropzone = wrapper.get('[aria-label="选择收款凭证图片"]');
    await dropzone.trigger("drop", { dataTransfer: { files: [pngFile] } });
    expect(uploader(wrapper).props("modelValue")).toEqual([pngFile]);

    await dropzone.trigger("click");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("点击凭证数量打开图片预览", async () => {
    vi.mocked(rentPaymentsApi.list).mockResolvedValue([existingPayment]);
    const wrapper = mountView();
    await flushPromises();

    await findButton(wrapper, "1 张").trigger("click");

    expect(wrapper.get('img[alt="房租收款凭证 1"]').attributes("src")).toContain("existing-1");
    expect(wrapper.text()).toContain("existing.png");
  });

  it("可开具收据并刷新列表，也可预览已开收据", async () => {
    vi.mocked(rentPaymentsApi.list).mockResolvedValue([existingPayment]);
    const wrapper = mountView();
    await flushPromises();

    await findButton(wrapper, "开收据").trigger("click");
    await flushPromises();
    expect(receiptsApi.create).toHaveBeenCalledWith({ sourceType: "rent-payment", sourceId: "payment-1" });
    expect(receiptsApi.list).toHaveBeenCalledTimes(2);

    vi.mocked(receiptsApi.list).mockResolvedValue([activeReceipt]);
    await findButton(wrapper, "刷新").trigger("click");
    await flushPromises();
    await findButton(wrapper, "查看收据").trigger("click");
    expect(wrapper.get("iframe").attributes("src")).toContain("receipt-file-1");
  });

  it("保留收据状态和关键字筛选", async () => {
    vi.mocked(rentPaymentsApi.list).mockResolvedValue([existingPayment]);
    vi.mocked(receiptsApi.list).mockResolvedValue([activeReceipt]);
    const wrapper = mountView();
    await flushPromises();

    const table = wrapper.get(".rent-payments-table");
    expect(table.text()).toContain("租户");

    await wrapper.get('[aria-label="收据状态筛选"]').setValue("pending");
    expect(table.text()).not.toContain("租户");

    await wrapper.get('[aria-label="收据状态筛选"]').setValue("issued");
    await wrapper.get('[aria-label="收款记录搜索"]').setValue("不存在的租户");
    expect(table.text()).not.toContain("租户");

    await wrapper.get('[aria-label="收款记录搜索"]').setValue("转账");
    expect(table.text()).toContain("租户");
  });

  it("编辑弹窗保留删除流程", async () => {
    vi.mocked(rentPaymentsApi.list).mockResolvedValue([existingPayment]);
    const wrapper = mountView();
    await flushPromises();

    await findButton(wrapper, "编辑").trigger("click");
    await findButton(wrapper, "删除").trigger("click");
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalled();
    expect(rentPaymentsApi.remove).toHaveBeenCalledWith("payment-1");
  });

  it("上传进行中重复保存只发起一次上传和创建请求", async () => {
    let resolveUpload!: (files: Awaited<ReturnType<typeof filesApi.upload>>) => void;
    vi.mocked(filesApi.upload).mockImplementation(
      () => new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const wrapper = mountView();
    await flushPromises();
    await findButton(wrapper, "新增房租收费").trigger("click");
    await uploader(wrapper).vm.$emit("update:modelValue", [new File(["one"], "one.png", { type: "image/png" })]);

    const saveButton = findButton(wrapper, "保存");
    const firstClick = saveButton.trigger("click");
    const secondClick = saveButton.trigger("click");
    await Promise.all([firstClick, secondClick]);
    await flushPromises();
    expect(filesApi.upload).toHaveBeenCalledTimes(1);

    resolveUpload!([
      {
        id: "uploaded-1",
        originalName: "one.png",
        mimeType: "image/png",
        size: 1,
        category: "payment-voucher",
        storagePath: "payment-voucher/one.png",
      },
    ]);
    await flushPromises();
    expect(rentPaymentsApi.create).toHaveBeenCalledTimes(1);
  });
});
