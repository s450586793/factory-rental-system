import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, inject, provide } from "vue";
import { ElMessage } from "element-plus";
import DepositsView from "./DepositsView.vue";
import { depositsApi, unitsApi } from "../api";
import type { Contract, DepositAccountSummary, DepositRecord, UnitSummary } from "../types/models";

vi.mock("../api", () => ({
  depositsApi: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), list: vi.fn(), listAccounts: vi.fn() },
  filesApi: { upload: vi.fn() },
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

const contract = {
  id: "contract-1",
  unitId: "unit-1",
  lessorName: "出租方",
  lessorLicenseCode: "license",
  lessorContactName: "联系人",
  lessorPhone: "13800000000",
  tenantName: "精密制造",
  contactName: "联系人",
  tenantPhone: "13900000000",
  licenseCode: "",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  annualRent: 120000,
  depositAmount: 10000,
  billingFrequency: "annual",
  depositSettlementMode: "initial",
  depositCarryoverAmount: 0,
  depositCarryoverSourceContractId: null,
  dueReceivableAmount: 120000,
  duePaidAmount: 120000,
  outstandingAmount: 0,
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
  location: "东区",
  area: 100,
  status: "occupied",
  activeContract: contract,
  contractCount: 1,
  contracts: [contract],
  meterConfigs: [],
} satisfies UnitSummary;

const accounts = [
  {
    unitId: "unit-1",
    unit: { id: "unit-1", code: "A1", location: "东区" },
    tenantName: "精密制造",
    agreedDepositAmount: 10000,
    heldAmount: -500,
    supplementAmount: 10500,
    refundAmount: 0,
    latestContractId: "contract-1",
    lastTransactionDate: "2026-08-20",
  },
  {
    unitId: "unit-1",
    unit: { id: "unit-1", code: "A1", location: "东区" },
    tenantName: "精密制造有限公司",
    agreedDepositAmount: 8000,
    heldAmount: 10000,
    supplementAmount: 0,
    refundAmount: 2000,
    latestContractId: "contract-2",
    lastTransactionDate: "2026-08-21",
  },
] satisfies DepositAccountSummary[];

const record = {
  id: "deposit-1",
  unitId: "unit-1",
  contractId: "contract-1",
  tenantNameSnapshot: "精密制造",
  type: "received",
  paymentDate: "2026-08-20",
  amount: 10000,
  method: "转账",
  note: null,
  attachmentFiles: [],
  unit,
  contract,
} satisfies DepositRecord;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function passthroughStub(tag = "div") {
  return defineComponent({
    props: ["modelValue"],
    emits: ["update:modelValue"],
    setup(_, { attrs, emit, slots }) {
      return () => h(tag, { ...attrs, onUpdateModelValue: (value: unknown) => emit("update:modelValue", value) }, [slots.default?.(), slots.footer?.()]);
    },
  });
}

function mountView() {
  const tableRowsKey = Symbol("tableRows");
  type TableRowsContext = { getRows: () => unknown[] };

  return mount(DepositsView, {
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
        "el-dialog": true,
        "el-form": passthroughStub("form"),
        "el-form-item": passthroughStub(),
        "el-row": passthroughStub(),
        "el-col": passthroughStub(),
        "el-space": passthroughStub(),
        "el-select": passthroughStub("select"),
        "el-option": true,
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

describe("DepositsView 押金账户", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(unitsApi.list).mockResolvedValue([unit]);
    vi.mocked(depositsApi.listAccounts).mockResolvedValue(accounts);
    vi.mocked(depositsApi.list).mockResolvedValue([record]);
  });

  it("按厂房和精确租户分别展示账户，并标出负余额产生的需补和正数应退", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("押金账户");
    expect(wrapper.text()).toContain("精密制造");
    expect(wrapper.text()).toContain("精密制造有限公司");
    expect(wrapper.text()).toContain("-¥500.00");
    expect(wrapper.text()).toContain("2026-08-20");
    expect(wrapper.get('[data-test="deposit-account-supplement"]').classes()).toContain("amount-overdue");
    expect(
      wrapper.findAll('[data-test="deposit-account-refund"]').some((item) => item.classes().includes("amount-overdue")),
    ).toBe(true);
  });

  it("一次刷新完成后原子更新账户和流水，并忽略更早请求的迟到结果", async () => {
    const staleAccounts = deferred<DepositAccountSummary[]>();
    const staleRecords = deferred<DepositRecord[]>();
    vi.mocked(depositsApi.listAccounts)
      .mockReturnValueOnce(staleAccounts.promise)
      .mockResolvedValueOnce([{ ...accounts[0], tenantName: "最新租户", heldAmount: 12000 }]);
    vi.mocked(depositsApi.list)
      .mockReturnValueOnce(staleRecords.promise)
      .mockResolvedValueOnce([{ ...record, tenantNameSnapshot: "最新租户", amount: 12000 }]);

    const wrapper = mountView();
    await findButton(wrapper, "刷新").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("最新租户");
    expect(wrapper.text()).toContain("¥12,000.00");

    staleAccounts.resolve(accounts);
    staleRecords.resolve([record]);
    await flushPromises();

    expect(wrapper.text()).toContain("最新租户");
    expect(wrapper.text()).not.toContain("精密制造有限公司");
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it("忽略迟到加载错误及其 finally，不提前结束最新刷新", async () => {
    const staleAccounts = deferred<DepositAccountSummary[]>();
    const latestAccounts = deferred<DepositAccountSummary[]>();
    vi.mocked(depositsApi.listAccounts)
      .mockReturnValueOnce(staleAccounts.promise)
      .mockReturnValueOnce(latestAccounts.promise);

    const wrapper = mountView();
    await findButton(wrapper, "刷新").trigger("click");
    staleAccounts.reject(new Error("迟到错误"));
    await flushPromises();

    expect(findButton(wrapper, "刷新").attributes("disabled")).toBeDefined();
    expect(ElMessage.error).not.toHaveBeenCalledWith("迟到错误");
  });

  it("组件卸载后忽略押金加载的迟到错误及 finally", async () => {
    const pendingAccounts = deferred<DepositAccountSummary[]>();
    vi.mocked(depositsApi.listAccounts).mockReturnValueOnce(pendingAccounts.promise);
    const wrapper = mountView();
    const view = wrapper.vm as unknown as { loading: boolean };

    expect(view.loading).toBe(true);
    wrapper.unmount();
    pendingAccounts.reject(new Error("卸载后错误"));
    await flushPromises();

    expect(view.loading).toBe(true);
    expect(ElMessage.error).not.toHaveBeenCalledWith("卸载后错误");
  });

  it("组件卸载后忽略押金加载的迟到成功且不提交账户", async () => {
    const pendingAccounts = deferred<DepositAccountSummary[]>();
    vi.mocked(depositsApi.listAccounts).mockReturnValueOnce(pendingAccounts.promise);
    const wrapper = mountView();
    const view = wrapper.vm as unknown as {
      accounts: DepositAccountSummary[];
      loading: boolean;
    };

    wrapper.unmount();
    pendingAccounts.resolve(accounts);
    await flushPromises();

    expect(view.accounts).toEqual([]);
    expect(view.loading).toBe(true);
  });
});
