import { flushPromises, mount } from "@vue/test-utils";
import { computed, defineComponent, h, inject, nextTick, provide, type ComputedRef } from "vue";
import { ElMessage } from "element-plus";
import RentPaymentsView from "./RentPaymentsView.vue";
import { receiptsApi, rentPaymentsApi, rentReceivablesApi, unitsApi } from "../api";
import type {
  Contract,
  Receipt,
  RentPayment,
  RentPaymentAllocationPreview,
  RentReceivable,
  UnitSummary,
} from "../types/models";

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
  tenantName: "甲租户",
  contactName: "甲租户",
  tenantPhone: "13900000000",
  licenseCode: "",
  tenantSafetyManager: "租户",
  signedDate: "2026-01-01",
  startDate: "2026-01-01",
  endDate: "2027-12-31",
  annualRent: 100000,
  depositAmount: 1000,
  electricUnitPrice: 0.95,
  electricLineLossPercent: 5,
  waterUnitPrice: 1,
  earlyTerminationPenaltyAmount: 1000,
  billingFrequency: "annual",
  depositSettlementMode: "initial",
  depositCarryoverAmount: 0,
  depositCarryoverSourceContractId: null,
  dueReceivableAmount: 180000,
  duePaidAmount: 100000,
  outstandingAmount: 80000,
  prepaidAmount: 0,
  unallocatedAmount: 0,
  status: "active",
  businessLicenseFileId: null,
  businessLicenseFile: null,
  attachmentFiles: [],
} satisfies Contract;

const secondContract = {
  ...contract,
  id: "contract-2",
  unitId: "unit-2",
  tenantName: "乙租户",
  contactName: "乙租户",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  annualRent: 60000,
  dueReceivableAmount: 0,
  duePaidAmount: 0,
  outstandingAmount: 60000,
} satisfies Contract;

const unit = {
  id: "unit-1",
  code: "A1",
  location: "东区",
  area: 100,
  status: "occupied",
  activeContract: contract,
  contractCount: 1,
  contracts: [contract],
  meterConfigs: [],
} satisfies UnitSummary;

const secondUnit = {
  id: "unit-2",
  code: "B2",
  location: "西区",
  area: 120,
  status: "occupied",
  activeContract: secondContract,
  contractCount: 1,
  contracts: [secondContract],
  meterConfigs: [],
} satisfies UnitSummary;

const overdueSchedule = {
  id: "schedule-1",
  contractId: "contract-1",
  sequence: 1,
  periodStart: "2026-01-01",
  periodEnd: "2026-12-31",
  dueDate: "2026-01-01",
  receivableAmount: 100000,
  paidAmount: 20000,
  outstandingAmount: 80000,
  prepaidAmount: 0,
  status: "overdue",
} satisfies RentReceivable;

const notDueSchedule = {
  id: "schedule-2",
  contractId: "contract-1",
  sequence: 2,
  periodStart: "2027-01-01",
  periodEnd: "2027-12-31",
  dueDate: "2027-01-01",
  receivableAmount: 100000,
  paidAmount: 0,
  outstandingAmount: 100000,
  prepaidAmount: 0,
  status: "not-due",
} satisfies RentReceivable;

const prepaidSchedule = {
  id: "schedule-3",
  contractId: "contract-2",
  sequence: 1,
  periodStart: "2027-01-01",
  periodEnd: "2027-12-31",
  dueDate: "2027-01-01",
  receivableAmount: 60000,
  paidAmount: 10000,
  outstandingAmount: 50000,
  prepaidAmount: 10000,
  status: "partially-prepaid",
} satisfies RentReceivable;

const existingPayment = {
  id: "payment-1",
  unitId: "unit-1",
  contractId: "contract-1",
  tenantNameSnapshot: "甲租户",
  paymentDate: "2026-08-01",
  amount: 20000,
  method: "转账",
  note: "",
  unit,
  contract,
  attachmentFiles: [],
} satisfies RentPayment;

const activeReceipt = {
  id: "receipt-1",
  receiptNo: "R202608001",
  sourceType: "rent-payment",
  sourceId: "payment-1",
  tenantNameSnapshot: "甲租户",
  unitCodeSnapshot: "A1",
  amountSnapshot: 20000,
  issueDate: "2026-08-01",
  summary: "房租",
  pdfFileId: null,
  pdfFile: null,
  status: "active",
  voidedAt: null,
} satisfies Receipt;

const preview = {
  allocations: [
    {
      scheduleId: "schedule-1",
      sequence: 1,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      allocatedAmount: 80000,
    },
    {
      scheduleId: "schedule-2",
      sequence: 2,
      periodStart: "2027-01-01",
      periodEnd: "2027-12-31",
      allocatedAmount: 20000,
    },
  ],
  unallocatedAmount: 0,
} satisfies RentPaymentAllocationPreview;

type TabsContext = {
  active: ComputedRef<string>;
  setActive: (value: string) => void;
};

const tabsKey = Symbol("tabs");

const tabsStub = defineComponent({
  props: { modelValue: { type: String, required: true } },
  emits: ["update:modelValue"],
  setup(props, { emit, slots }) {
    provide<TabsContext>(tabsKey, {
      active: computed(() => props.modelValue),
      setActive: (value) => emit("update:modelValue", value),
    });
    return () => h("div", { class: "el-tabs" }, slots.default?.());
  },
});

const tabPaneStub = defineComponent({
  inheritAttrs: false,
  props: { name: { type: String, required: true }, label: { type: String, required: true } },
  setup(props, { attrs, slots }) {
    const tabs = inject<TabsContext>(tabsKey)!;
    return () =>
      h(
        "section",
        {
          ...attrs,
          class: [attrs.class, { "is-active": tabs.active.value === props.name }],
          onClick: () => tabs.setActive(props.name),
        },
        [h("span", { class: "tab-label" }, props.label), tabs.active.value === props.name ? slots.default?.() : null],
      );
  },
});

function inputStub(tag = "input") {
  return defineComponent({
    inheritAttrs: false,
    props: ["modelValue"],
    emits: ["update:modelValue", "change"],
    setup(props, { attrs, emit, slots }) {
      return () =>
        h(
          tag,
          {
            ...attrs,
            value: props.modelValue,
            "model-value": String(props.modelValue ?? ""),
            onInput: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).value),
            onChange: (event: Event) => {
              const value = (event.target as HTMLInputElement).value;
              emit("update:modelValue", value);
              emit("change", value);
            },
          },
          slots.default?.(),
        );
    },
  });
}

const selectStub = inputStub("select");
const optionStub = defineComponent({
  props: ["label", "value"],
  setup(props) {
    return () => h("option", { value: props.value }, String(props.label));
  },
});

const dialogStub = defineComponent({
  inheritAttrs: false,
  props: ["modelValue", "title"],
  emits: ["update:modelValue"],
  setup(props, { attrs, slots }) {
    return () =>
      props.modelValue
        ? h("div", { ...attrs, "data-dialog-title": props.title }, [slots.default?.(), slots.footer?.()])
        : null;
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
          props: ["loading", "disabled"],
          emits: ["click"],
          setup(props, { attrs, emit, slots }) {
            return () =>
              h(
                "button",
                { ...attrs, disabled: props.loading || props.disabled, onClick: () => emit("click") },
                slots.default?.(),
              );
          },
        }),
        "el-dialog": dialogStub,
        "el-form": inputStub("form"),
        "el-form-item": inputStub("div"),
        "el-row": inputStub("div"),
        "el-col": inputStub("div"),
        "el-space": inputStub("div"),
        "el-select": selectStub,
        "el-option": optionStub,
        "el-input": inputStub(),
        "el-input-number": inputStub(),
        "el-date-picker": inputStub(),
        "el-tag": inputStub("span"),
        "el-tooltip": inputStub("span"),
        "el-tabs": tabsStub,
        "el-tab-pane": tabPaneStub,
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
            return () =>
              h(
                "div",
                table
                  .getRows()
                  .map((row) =>
                    slots.default?.({ row }) ??
                    h("span", String((row as Record<string, unknown>)[props.prop as string] ?? "")),
                  ),
              );
          },
        }),
        PaymentVoucherPreviewDialog: true,
        PaymentVoucherUpload: true,
      },
    },
  });
}

function findButton(wrapper: ReturnType<typeof mountView>, text: string) {
  const button = wrapper.findAll("button").find((item) => item.text() === text);
  expect(button, `expected button ${text}`).toBeTruthy();
  return button!;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitForPreview() {
  await vi.advanceTimersByTimeAsync(250);
  await flushPromises();
}

describe("RentPaymentsView 应收计划", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(unitsApi.list).mockResolvedValue([unit, secondUnit]);
    vi.mocked(rentPaymentsApi.list).mockResolvedValue([existingPayment]);
    vi.mocked(receiptsApi.list).mockResolvedValue([]);
    vi.mocked(rentReceivablesApi.list).mockResolvedValue({
      items: [overdueSchedule, notDueSchedule, prepaidSchedule],
    });
    vi.mocked(rentPaymentsApi.previewAllocation).mockResolvedValue(preview);
    vi.mocked(rentPaymentsApi.create).mockResolvedValue({
      payment: existingPayment,
      ...preview,
    });
    vi.mocked(rentPaymentsApi.update).mockResolvedValue({
      payment: existingPayment,
      ...preview,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("默认打开应收计划，并从应收数据生成唯一租户选项", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('[data-test="receivables-tab"]').classes()).toContain("is-active");
    expect(wrapper.get('[data-test="payments-tab"]').classes()).not.toContain("is-active");
    expect(wrapper.get('[data-test="receivable-tenant-filter"]').element.tagName).toBe("SELECT");
    expect(wrapper.get('[data-test="receivable-tenant-filter"]').findAll("option").map((item) => item.text())).toEqual([
      "全部租户",
      "甲租户",
      "乙租户",
    ]);
  });

  it("按房源、租户、年度和状态筛选应收计划", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('[data-test="receivable-unit-filter"]').setValue("unit-2");
    expect(wrapper.get(".rent-receivables-table").text()).toContain("B2");
    expect(wrapper.get(".rent-receivables-table").text()).not.toContain("A1");

    await wrapper.get('[data-test="receivable-unit-filter"]').setValue("");
    await wrapper.get('[data-test="receivable-tenant-filter"]').setValue("甲租户");
    await wrapper.get('[data-test="receivable-year-filter"]').setValue("2026");
    await wrapper.get('[data-test="receivable-status-filter"]').setValue("overdue");
    expect(wrapper.get(".rent-receivables-table").text()).toContain("2026-01-01");
    expect(wrapper.get(".rent-receivables-table").text()).not.toContain("2027-01-01 至 2027-12-31");
  });

  it("显示固定状态文案，且只有欠费状态使用红色金额", async () => {
    vi.mocked(rentReceivablesApi.list).mockResolvedValue({
      items: [
        overdueSchedule,
        notDueSchedule,
        { ...prepaidSchedule, status: "partially-prepaid" },
        { ...prepaidSchedule, id: "schedule-4", status: "prepaid" },
        { ...prepaidSchedule, id: "schedule-5", status: "settled", outstandingAmount: 0 },
      ],
    });
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("欠费");
    expect(wrapper.text()).toContain("未到期");
    expect(wrapper.text()).toContain("部分预收");
    expect(wrapper.text()).toContain("已预收");
    expect(wrapper.text()).toContain("已结清");
    expect(wrapper.get('[data-test="receivable-balance-schedule-1"]').classes()).toContain("is-overdue");
    expect(wrapper.get('[data-test="receivable-balance-schedule-2"]').classes()).not.toContain("is-overdue");
  });

  it("登记选中期次时预填合同和本期未收金额", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('[data-test="register-schedule-payment-schedule-1"]').trigger("click");

    expect(wrapper.get('[aria-label="对应合同"]').attributes("model-value")).toBe("contract-1");
    expect(wrapper.get('[aria-label="金额"]').attributes("model-value")).toBe("80000");
  });

  it("保存前显示跨期分配和未分配结余", async () => {
    vi.mocked(rentPaymentsApi.previewAllocation).mockResolvedValue({
      ...preview,
      unallocatedAmount: 5000,
    });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('[data-test="register-schedule-payment-schedule-1"]').trigger("click");
    await wrapper.get('[aria-label="金额"]').setValue("105000");
    await waitForPreview();

    expect(rentPaymentsApi.previewAllocation).toHaveBeenLastCalledWith({
      contractId: "contract-1",
      paymentDate: expect.any(String),
      amount: 105000,
      excludePaymentId: undefined,
    });
    expect(wrapper.get('[data-test="allocation-preview"]').text()).toContain("第 1 期");
    expect(wrapper.get('[data-test="allocation-preview"]').text()).toContain("¥80,000.00");
    expect(wrapper.get('[data-test="allocation-preview"]').text()).toContain("第 2 期");
    expect(wrapper.get('[data-test="allocation-preview"]').text()).toContain("未分配结余");
    expect(wrapper.get('[data-test="allocation-preview"]').text()).toContain("¥5,000.00");
  });

  it("忽略晚到的旧预览响应", async () => {
    const first = deferred<RentPaymentAllocationPreview>();
    const second = deferred<RentPaymentAllocationPreview>();
    vi.mocked(rentPaymentsApi.previewAllocation)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('[data-test="register-schedule-payment-schedule-1"]').trigger("click");
    await waitForPreview();

    await wrapper.get('[aria-label="金额"]').setValue("90000");
    await waitForPreview();
    second.resolve({ allocations: [{ ...preview.allocations[0], allocatedAmount: 90000 }], unallocatedAmount: 0 });
    await flushPromises();
    expect(wrapper.get('[data-test="allocation-preview"]').text()).toContain("¥90,000.00");

    first.resolve(preview);
    await flushPromises();
    expect(wrapper.get('[data-test="allocation-preview"]').text()).toContain("¥90,000.00");
    expect(wrapper.get('[data-test="allocation-preview"]').text()).not.toContain("¥20,000.00");
  });

  it("关闭弹窗后不写回晚到的预览响应", async () => {
    const pending = deferred<RentPaymentAllocationPreview>();
    vi.mocked(rentPaymentsApi.previewAllocation).mockReturnValueOnce(pending.promise);
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('[data-test="register-schedule-payment-schedule-1"]').trigger("click");
    await waitForPreview();
    await findButton(wrapper, "取消").trigger("click");

    pending.resolve(preview);
    await flushPromises();
    expect(wrapper.find('[data-test="allocation-preview"]').exists()).toBe(false);
  });

  it("编辑预览排除当前收款，并在保存 mutation result 后刷新三类数据", async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('[data-test="payments-tab"]').trigger("click");
    await nextTick();
    await findButton(wrapper, "编辑").trigger("click");
    await waitForPreview();

    expect(rentPaymentsApi.previewAllocation).toHaveBeenLastCalledWith({
      contractId: "contract-1",
      paymentDate: "2026-08-01",
      amount: 20000,
      excludePaymentId: "payment-1",
    });
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(rentPaymentsApi.update).toHaveBeenCalledWith("payment-1", expect.any(Object));
    expect(rentReceivablesApi.list).toHaveBeenCalledTimes(2);
    expect(rentPaymentsApi.list).toHaveBeenCalledTimes(2);
    expect(receiptsApi.list).toHaveBeenCalledTimes(2);
  });

  it("新增保存使用 mutation result 结构并刷新应收、收款和收据", async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('[data-test="register-schedule-payment-schedule-1"]').trigger("click");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(rentPaymentsApi.create).toHaveBeenCalledTimes(1);
    expect(rentReceivablesApi.list).toHaveBeenCalledTimes(2);
    expect(rentPaymentsApi.list).toHaveBeenCalledTimes(2);
    expect(receiptsApi.list).toHaveBeenCalledTimes(2);
  });

  it("旧页面请求晚到时不覆盖保存后刷新的四类数据", async () => {
    const oldUnits = deferred<UnitSummary[]>();
    const oldPayments = deferred<RentPayment[]>();
    const oldReceipts = deferred<Receipt[]>();
    const oldReceivables = deferred<{ items: RentReceivable[] }>();
    const freshUnit = { ...unit, code: "NEW" } satisfies UnitSummary;
    const freshPayment = { ...existingPayment, tenantNameSnapshot: "新收款", unit: freshUnit } satisfies RentPayment;
    const freshReceivable = {
      ...overdueSchedule,
      periodStart: "2028-01-01",
      periodEnd: "2028-12-31",
      dueDate: "2028-01-01",
    } satisfies RentReceivable;
    vi.mocked(unitsApi.list).mockReturnValueOnce(oldUnits.promise).mockResolvedValueOnce([freshUnit]);
    vi.mocked(rentPaymentsApi.list).mockReturnValueOnce(oldPayments.promise).mockResolvedValueOnce([freshPayment]);
    vi.mocked(receiptsApi.list).mockReturnValueOnce(oldReceipts.promise).mockResolvedValueOnce([activeReceipt]);
    vi.mocked(rentReceivablesApi.list)
      .mockReturnValueOnce(oldReceivables.promise)
      .mockResolvedValueOnce({ items: [freshReceivable] });
    const wrapper = mountView();

    await findButton(wrapper, "新增房租收费").trigger("click");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(wrapper.get(".rent-receivables-table").text()).toContain("NEW");
    expect(wrapper.get(".rent-receivables-table").text()).toContain("2028-01-01");

    oldUnits.resolve([{ ...unit, code: "OLD" }]);
    oldPayments.resolve([{ ...existingPayment, tenantNameSnapshot: "旧收款" }]);
    oldReceipts.resolve([]);
    oldReceivables.resolve({ items: [overdueSchedule] });
    await flushPromises();

    expect(wrapper.get(".rent-receivables-table").text()).toContain("NEW");
    expect(wrapper.get(".rent-receivables-table").text()).toContain("2028-01-01");
    expect(wrapper.get(".rent-receivables-table").text()).not.toContain("OLD");
    await wrapper.get('[data-test="payments-tab"]').trigger("click");
    await nextTick();
    expect(wrapper.get(".rent-payments-table").text()).toContain("新收款");
    expect(wrapper.get(".rent-payments-table").text()).toContain("已开");
    expect(wrapper.get(".rent-payments-table").text()).not.toContain("旧收款");
    expect(wrapper.get('button[aria-label="刷新"]').attributes("disabled")).toBeUndefined();
  });

  it("旧页面请求失败时不覆盖新成功，也不能结束最新请求的 loading", async () => {
    const oldUnits = deferred<UnitSummary[]>();
    const latestUnits = deferred<UnitSummary[]>();
    const latestPayments = deferred<RentPayment[]>();
    const latestReceipts = deferred<Receipt[]>();
    const latestReceivables = deferred<{ items: RentReceivable[] }>();
    const freshUnit = { ...unit, code: "NEW" } satisfies UnitSummary;
    vi.mocked(unitsApi.list)
      .mockReturnValueOnce(oldUnits.promise)
      .mockResolvedValueOnce([freshUnit])
      .mockReturnValueOnce(latestUnits.promise);
    vi.mocked(rentPaymentsApi.list)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([existingPayment])
      .mockReturnValueOnce(latestPayments.promise);
    vi.mocked(receiptsApi.list)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(latestReceipts.promise);
    vi.mocked(rentReceivablesApi.list)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [overdueSchedule] })
      .mockReturnValueOnce(latestReceivables.promise);
    const wrapper = mountView();

    await findButton(wrapper, "新增房租收费").trigger("click");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(wrapper.get(".rent-receivables-table").text()).toContain("NEW");

    await wrapper.get('button[aria-label="刷新"]').trigger("click");
    expect(wrapper.get('button[aria-label="刷新"]').attributes("disabled")).toBeDefined();
    oldUnits.reject(new Error("旧请求失败"));
    await flushPromises();
    expect(ElMessage.error).not.toHaveBeenCalledWith("旧请求失败");
    expect(wrapper.get(".rent-receivables-table").text()).toContain("NEW");
    expect(wrapper.get('button[aria-label="刷新"]').attributes("disabled")).toBeDefined();

    latestUnits.resolve([freshUnit]);
    latestPayments.resolve([existingPayment]);
    latestReceipts.resolve([]);
    latestReceivables.resolve({ items: [overdueSchedule] });
    await flushPromises();
    expect(wrapper.get('button[aria-label="刷新"]').attributes("disabled")).toBeUndefined();
  });
});
