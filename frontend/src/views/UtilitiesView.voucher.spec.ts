import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, inject, provide } from "vue";
import { ElMessage } from "element-plus";
import UtilitiesView from "./UtilitiesView.vue";
import { filesApi, receiptsApi, unitsApi, utilitiesApi } from "../api";
import type { Contract, UnitSummary, UtilityChargeRecord } from "../types/models";

vi.mock("../api", () => ({
  filesApi: { upload: vi.fn() },
  receiptsApi: { create: vi.fn() },
  unitsApi: { list: vi.fn() },
  utilitiesApi: { createRecord: vi.fn(), listRecords: vi.fn(), payRecord: vi.fn(), prefill: vi.fn(), removeRecord: vi.fn(), updateRecord: vi.fn() },
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

const unpaidRecord = {
  id: "utility-1",
  unitId: "unit-1",
  contractId: "contract-1",
  tenantNameSnapshot: "租户",
  tenantPhoneSnapshot: "13900000000",
  type: "electric",
  previousReadAt: "2026-08-01",
  currentReadAt: "2026-08-20",
  totalUsage: 10,
  adjustedUsage: 10,
  amount: 100,
  status: "unpaid",
  recordedAt: "2026-08-20",
  paidAt: null,
  paymentMethod: null,
  note: null,
  attachmentFiles: [],
  unit,
  contract,
  items: [],
} satisfies UtilityChargeRecord;

const paidRecord = {
  ...unpaidRecord,
  id: "utility-paid-1",
  status: "paid",
  paidAt: "2026-08-01",
  paymentMethod: "转账",
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
} satisfies UtilityChargeRecord;

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

const inputStub = defineComponent({
  props: ["modelValue"],
  emits: ["update:modelValue"],
  setup(props, { attrs, emit }) {
    return () => h("input", {
      ...attrs,
      value: props.modelValue,
      onInput: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).value),
    });
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

const paymentVoucherPreviewDialogStub = defineComponent({
  props: ["modelValue", "files"],
  setup(props) {
    return () => (props.modelValue ? h("div", { class: "voucher-preview-stub" }, `${props.files?.length ?? 0} 张凭证`) : null);
  },
});

function mountView() {
  const tableRowsKey = Symbol("tableRows");
  type TableRowsContext = { getRows: () => unknown[] };

  return mount(UtilitiesView, {
    global: {
      directives: { loading: {} },
      stubs: {
        "el-button": defineComponent({
          props: ["loading", "disabled"],
          emits: ["click"],
          setup(props, { attrs, emit, slots }) {
            return () => h("button", { ...attrs, disabled: props.loading || props.disabled, onClick: () => emit("click") }, slots.default?.());
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
        "el-input": inputStub,
        "el-input-number": inputStub,
        "el-date-picker": inputStub,
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
        PaymentVoucherPreviewDialog: paymentVoucherPreviewDialogStub,
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

describe("UtilitiesView 收款凭证", () => {
  beforeEach(() => {
    vi.mocked(unitsApi.list).mockResolvedValue([unit]);
    vi.mocked(utilitiesApi.listRecords).mockResolvedValue([unpaidRecord]);
    vi.mocked(utilitiesApi.prefill).mockResolvedValue({ unitId: "unit-1", type: "electric", meters: [] });
    vi.mocked(utilitiesApi.payRecord).mockResolvedValue(unpaidRecord);
    vi.mocked(filesApi.upload).mockResolvedValue([
      { id: "uploaded-1", originalName: "one.png", mimeType: "image/png", size: 1, category: "payment-voucher", storagePath: "payment-voucher/one.png" },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("首次缴费先上传待处理凭证，再提交缴费日期、方式和文件 ID", async () => {
    const pngFile = new File(["one"], "one.png", { type: "image/png" });
    const wrapper = mountView();
    await flushPromises();

    await findButton(wrapper, "标记已缴费").trigger("click");
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("2026-08-21");
    await inputs[1].setValue("微信");
    await uploader(wrapper).vm.$emit("update:modelValue", [pngFile]);
    await findButton(wrapper, "确认缴费").trigger("click");
    await flushPromises();

    expect(filesApi.upload).toHaveBeenCalledWith([pngFile], "payment-voucher");
    expect(utilitiesApi.payRecord).toHaveBeenCalledWith("utility-1", {
      paidAt: "2026-08-21",
      paymentMethod: "微信",
      attachmentFileIds: ["uploaded-1"],
    });
    expect(vi.mocked(filesApi.upload).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(utilitiesApi.payRecord).mock.invocationCallOrder[0],
    );
  });

  it("缴费上传进行中重复点击确认只发起一次上传和缴费请求", async () => {
    let resolveUpload: (files: Awaited<ReturnType<typeof filesApi.upload>>) => void;
    vi.mocked(filesApi.upload).mockImplementation(
      () => new Promise((resolve) => { resolveUpload = resolve; }),
    );
    const wrapper = mountView();
    await flushPromises();

    await findButton(wrapper, "标记已缴费").trigger("click");
    await uploader(wrapper).vm.$emit("update:modelValue", [new File(["one"], "one.png", { type: "image/png" })]);
    const confirmButton = findButton(wrapper, "确认缴费");
    await confirmButton.trigger("click");
    await confirmButton.trigger("click");
    expect(filesApi.upload).toHaveBeenCalledTimes(1);

    resolveUpload!([{ id: "uploaded-1", originalName: "one.png", mimeType: "image/png", size: 1, category: "payment-voucher", storagePath: "payment-voucher/one.png" }]);
    await flushPromises();

    expect(utilitiesApi.payRecord).toHaveBeenCalledTimes(1);
  });

  it("已缴费记录可移除旧凭证、追加新凭证并提交最终文件 ID 列表", async () => {
    vi.mocked(utilitiesApi.listRecords).mockResolvedValue([paidRecord]);
    vi.mocked(filesApi.upload).mockResolvedValue([
      { id: "uploaded-new", originalName: "new.png", mimeType: "image/png", size: 1, category: "payment-voucher", storagePath: "payment-voucher/new.png" },
    ]);
    const wrapper = mountView();
    await flushPromises();

    await findButton(wrapper, "管理凭证").trigger("click");
    expect(uploader(wrapper).props("existingFiles")).toEqual(paidRecord.attachmentFiles);
    expect(wrapper.findAll("input")).toHaveLength(0);
    await uploader(wrapper).vm.$emit("remove-existing", "existing-1");
    await uploader(wrapper).vm.$emit("update:modelValue", [new File(["new"], "new.png", { type: "image/png" })]);
    await findButton(wrapper, "保存凭证").trigger("click");
    await flushPromises();

    expect(utilitiesApi.payRecord).toHaveBeenCalledWith("utility-paid-1", {
      attachmentFileIds: ["uploaded-new"],
    });
  });

  it("点击凭证数量打开凭证预览", async () => {
    vi.mocked(utilitiesApi.listRecords).mockResolvedValue([paidRecord]);
    const wrapper = mountView();
    await flushPromises();

    await findButton(wrapper, "1 张").trigger("click");

    expect(wrapper.find(".voucher-preview-stub").text()).toContain("1 张凭证");
  });
});
