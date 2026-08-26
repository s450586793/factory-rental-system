import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, provide, inject } from "vue";
import { ElMessage } from "element-plus";
import UnitsView from "./UnitsView.vue";
import { contractsApi, depositsApi, rentPaymentsApi, rentReceivablesApi, unitsApi } from "../api";
import type {
  Contract,
  DepositAccountSummary,
  RentPayment,
  RentPaymentAllocationPreview,
  RentPaymentMutationResult,
  RentReceivable,
  UnitSummary,
} from "../types/models";

vi.mock("../api", () => ({
  contractsApi: {
    create: vi.fn(),
    update: vi.fn(),
    generateDocument: vi.fn(),
  },
  depositsApi: {
    listAccounts: vi.fn(),
  },
  filesApi: {
    upload: vi.fn(),
  },
  unitsApi: {
    list: vi.fn(),
    detail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  rentPaymentsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    previewAllocation: vi.fn(),
  },
  rentReceivablesApi: {
    list: vi.fn(),
    detail: vi.fn(),
    update: vi.fn(),
  },
  utilitiesApi: {
    createMeterConfig: vi.fn(),
    updateMeterConfig: vi.fn(),
    removeMeterConfig: vi.fn(),
  },
}));

vi.mock("element-plus", () => ({
  ElMessage: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn(),
  },
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

const activeContract = {
  id: "contract-old",
  lessorName: "江阴市示例产业园有限公司",
  lessorLicenseCode: "91320281TEST000001",
  lessorContactName: "吴孝斌",
  lessorPhone: "18651510352",
  tenantName: "曹忠",
  contactName: "曹忠",
  tenantPhone: "15951506512",
  licenseCode: "",
  startDate: "2026-07-01",
  endDate: "2027-06-30",
  annualRent: 50000,
  depositAmount: 10000,
  billingFrequency: "annual",
  depositSettlementMode: "initial",
  depositCarryoverAmount: 0,
  depositCarryoverSourceContractId: null,
  dueReceivableAmount: 50000,
  duePaidAmount: 0,
  outstandingAmount: 0,
  prepaidAmount: 0,
  unallocatedAmount: 0,
  status: "active",
} satisfies UnitSummary["activeContract"];

const oldContract = {
  id: "contract-old",
  unitId: "unit-1",
  lessorName: "江阴市示例产业园有限公司",
  lessorLicenseCode: "91320281TEST000001",
  lessorContactName: "吴孝斌",
  lessorPhone: "18651510352",
  tenantName: "曹忠",
  contactName: "曹忠",
  tenantPhone: "15951506512",
  licenseCode: "",
  startDate: "2026-07-01",
  endDate: "2027-06-30",
  annualRent: 50000,
  depositAmount: 10000,
  billingFrequency: "annual",
  depositSettlementMode: "initial",
  depositCarryoverAmount: 0,
  depositCarryoverSourceContractId: null,
  dueReceivableAmount: 50000,
  duePaidAmount: 0,
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
  code: "5",
  location: "测试厂房",
  area: 100,
  status: "occupied",
  activeContract,
  contractCount: 1,
  contracts: [oldContract],
  meterConfigs: [],
} satisfies UnitSummary;

const savedContract = {
  id: "contract-new",
  unitId: "unit-1",
  lessorName: "江阴市示例产业园有限公司",
  lessorLicenseCode: "91320281TEST000001",
  lessorContactName: "吴孝斌",
  lessorPhone: "18651510352",
  tenantName: "曹忠",
  contactName: "曹忠",
  tenantPhone: "15951506512",
  licenseCode: "",
  startDate: "2027-07-01",
  endDate: "2028-06-30",
  annualRent: 50000,
  depositAmount: 10000,
  billingFrequency: "annual",
  depositSettlementMode: "initial",
  depositCarryoverAmount: 0,
  depositCarryoverSourceContractId: null,
  dueReceivableAmount: 0,
  duePaidAmount: 0,
  outstandingAmount: 0,
  prepaidAmount: 0,
  unallocatedAmount: 0,
  status: "active",
  businessLicenseFileId: null,
  businessLicenseFile: null,
  attachmentFiles: [],
} satisfies Contract;

const vacantUnit = {
  id: "unit-vacant",
  code: "6",
  location: "空置厂房",
  area: 120,
  status: "vacant",
  activeContract: null,
  contractCount: 0,
  contracts: [],
  meterConfigs: [],
} satisfies UnitSummary;

const depositAccount = {
  unitId: "unit-1",
  unit: { id: "unit-1", code: "5", location: "测试厂房" },
  tenantName: "曹忠",
  agreedDepositAmount: 10000,
  heldAmount: 10000,
  supplementAmount: 0,
  refundAmount: 0,
  latestContractId: "contract-old",
  lastTransactionDate: "2026-07-01",
} satisfies DepositAccountSummary;

const receivable = {
  id: "schedule-1",
  contractId: "contract-old",
  sequence: 1,
  periodStart: "2026-07-01",
  periodEnd: "2027-06-30",
  dueDate: "2026-07-01",
  receivableAmount: 50000,
  paidAmount: 50000,
  outstandingAmount: 0,
  prepaidAmount: 0,
  status: "settled",
} satisfies RentReceivable;

const secondReceivable = {
  ...receivable,
  id: "schedule-2",
  contractId: "contract-second",
  periodStart: "2028-07-01",
  periodEnd: "2029-06-30",
  dueDate: "2028-07-01",
} satisfies RentReceivable;

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
    setup(_, { attrs, slots }) {
      return () => h(tag, attrs, [slots.default?.(), slots.footer?.()]);
    },
  });
}

const dialogStub = defineComponent({
  props: ["modelValue"],
  setup(props, { attrs, slots }) {
    return () => (props.modelValue ? h("div", attrs, [slots.default?.(), slots.footer?.()]) : null);
  },
});

function mountUnitsView() {
  const tableRowsKey = Symbol("tableRows");
  const radioGroupKey = Symbol("radioGroup");
  type TableRowsContext = {
    getRows: () => unknown[];
  };

  return mount(UnitsView, {
    global: {
      directives: {
        loading: {},
      },
      stubs: {
        "el-button": defineComponent({
          props: ["loading", "type", "text"],
          emits: ["click"],
          setup(props, { attrs, emit, slots }) {
            return () =>
              h(
                "button",
                {
                  ...attrs,
                  disabled: props.loading,
                  onClick: (event: MouseEvent) => emit("click", event),
                },
                slots.default?.(),
              );
          },
        }),
        "el-dialog": dialogStub,
        "el-drawer": dialogStub,
        "el-form": passthroughStub("form"),
        "el-form-item": passthroughStub("div"),
        "el-row": passthroughStub("div"),
        "el-col": passthroughStub("div"),
        "el-space": passthroughStub("div"),
        "el-tooltip": passthroughStub("div"),
        "el-table": defineComponent({
          props: ["data"],
          setup(props, { slots }) {
            provide<TableRowsContext>(tableRowsKey, {
              getRows: () => (Array.isArray(props.data) ? props.data : []),
            });
            return () => h("div", slots.default?.());
          },
        }),
        "el-table-column": defineComponent({
          props: ["prop", "label"],
          setup(props, { slots }) {
            const table = inject<TableRowsContext>(tableRowsKey, {
              getRows: () => [],
            });
            return () =>
              h(
                "div",
                [
                  h("span", String(props.label ?? "")),
                  ...table.getRows().map((row) =>
                    slots.default
                      ? slots.default({ row })
                      : h("span", String((row as Record<string, unknown>)[props.prop as string] ?? "")),
                  ),
                ],
              );
          },
        }),
        "el-tag": passthroughStub("span"),
        "el-select": defineComponent({
          props: ["modelValue"],
          emits: ["update:modelValue", "change"],
          setup(props, { attrs, emit, slots }) {
            return () =>
              h(
                "select",
                {
                  ...attrs,
                  value: props.modelValue,
                  onChange: (event: Event) => {
                    const value = (event.target as HTMLSelectElement).value;
                    emit("update:modelValue", value);
                    emit("change", value);
                  },
                },
                slots.default?.(),
              );
          },
        }),
        "el-option": defineComponent({
          props: ["label", "value"],
          setup(props) {
            return () => h("option", { value: props.value }, String(props.label ?? ""));
          },
        }),
        "el-radio-group": defineComponent({
          props: ["modelValue"],
          emits: ["update:modelValue", "change"],
          setup(props, { emit, slots }) {
            provide(radioGroupKey, {
              value: () => props.modelValue,
              select: (value: unknown) => {
                emit("update:modelValue", value);
                emit("change", value);
              },
            });
            return () => h("div", slots.default?.());
          },
        }),
        "el-radio-button": defineComponent({
          props: ["label"],
          setup(props, { attrs, slots }) {
            const group = inject<{ value: () => unknown; select: (value: unknown) => void }>(radioGroupKey)!;
            return () =>
              h(
                "button",
                {
                  ...attrs,
                  type: "button",
                  "aria-pressed": group.value() === props.label,
                  onClick: (event: MouseEvent) => {
                    const forwardedClick = attrs.onClick;
                    if (Array.isArray(forwardedClick)) {
                      forwardedClick.forEach((handler) => handler(event));
                    } else if (typeof forwardedClick === "function") {
                      forwardedClick(event);
                    }
                    group.select(props.label);
                  },
                },
                slots.default?.(),
              );
          },
        }),
        "el-switch": passthroughStub("button"),
        "el-input": defineComponent({
          props: ["modelValue"],
          emits: ["update:modelValue"],
          setup(props, { emit }) {
            return () =>
              h("input", {
                value: props.modelValue,
                onInput: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).value),
              });
          },
        }),
        "el-input-number": defineComponent({
          props: ["modelValue"],
          emits: ["update:modelValue"],
          setup(props, { emit }) {
            return () =>
              h("input", {
                type: "number",
                value: props.modelValue,
                onInput: (event: Event) => emit("update:modelValue", Number((event.target as HTMLInputElement).value)),
              });
          },
        }),
        "el-date-picker": defineComponent({
          props: ["modelValue"],
          emits: ["update:modelValue", "change"],
          setup(props, { emit }) {
            return () =>
              h("input", {
                value: props.modelValue,
                onInput: (event: Event) => {
                  const value = (event.target as HTMLInputElement).value;
                  emit("update:modelValue", value);
                  emit("change", value);
                },
              });
          },
        }),
      },
    },
  });
}

function findButton(wrapper: ReturnType<typeof mountUnitsView>, text: string) {
  const button = wrapper.findAll("button").find((item) => item.text() === text);
  expect(button, `expected button "${text}" in: ${wrapper.findAll("button").map((item) => item.text()).join(", ")}`).toBeTruthy();
  return button!;
}

async function openCreateContractDialog(wrapper: ReturnType<typeof mountUnitsView>) {
  await findButton(wrapper, "管理").trigger("click");
  await flushPromises();
  await findButton(wrapper, "新增合同").trigger("click");
  await flushPromises();
}

async function openCreateUnitDialog(wrapper: ReturnType<typeof mountUnitsView>) {
  await findButton(wrapper, "新增厂房").trigger("click");
  await flushPromises();
}

async function fillAnnualRent(wrapper: ReturnType<typeof mountUnitsView>, value: string) {
  const annualRentInput = wrapper.find('input[aria-label="年租金"]');
  expect(annualRentInput.exists()).toBe(true);
  await annualRentInput.setValue(value);
}

function findInputByLabel(wrapper: ReturnType<typeof mountUnitsView>, label: string) {
  const input = wrapper.find(`input[aria-label="${label}"]`);
  expect(input.exists(), `expected input with aria-label "${label}"`).toBe(true);
  return input;
}

function setDepositCarryoverAmount(wrapper: ReturnType<typeof mountUnitsView>, amount: number) {
  const vm = wrapper.vm as unknown as {
    contractForm: { depositCarryoverAmount: number };
  };
  vm.contractForm.depositCarryoverAmount = amount;
}

describe("UnitsView contract download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(unitsApi.list).mockResolvedValue([unit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(unit);
    vi.mocked(contractsApi.create).mockResolvedValue(savedContract);
    vi.mocked(contractsApi.update).mockResolvedValue(savedContract);
    vi.mocked(depositsApi.listAccounts).mockResolvedValue([depositAccount]);
    vi.mocked(rentReceivablesApi.list).mockResolvedValue({ items: [receivable] });
    vi.mocked(contractsApi.generateDocument).mockResolvedValue({
      file: {
        id: "contract-document--contract-new",
        originalName: "厂房租赁合同_5_曹忠_2027-07-01_2028-06-30.pdf",
        mimeType: "application/pdf",
      },
      filename: "厂房租赁合同_5_曹忠_2027-07-01_2028-06-30.pdf",
      mimeType: "application/pdf",
    });
  });

  it("shows due receivable, prepaid amount and billing frequency in contract history", async () => {
    const accruedContract = Object.assign({}, oldContract, {
      billingFrequency: "semiannual",
      dueReceivableAmount: 100000,
      prepaidAmount: 25000,
    }) as Contract;
    const accruedUnit = {
      ...unit,
      contracts: [accruedContract],
    };
    vi.mocked(unitsApi.list).mockResolvedValue([accruedUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(accruedUnit);
    const wrapper = mountUnitsView();
    await flushPromises();

    await findButton(wrapper, "显示").trigger("click");
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("已到期应收");
    expect(wrapper.text()).toContain("按半年");
    expect(wrapper.text()).toContain("¥100,000.00");
    expect(wrapper.text()).toContain("¥25,000.00");
  });

  it("renders zero contract summary amounts instead of placeholders", async () => {
    const zeroUnit = { ...unit, activeContract: savedContract, contracts: [savedContract] };
    vi.mocked(unitsApi.list).mockResolvedValue([zeroUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(zeroUnit);
    const wrapper = mountUnitsView();
    await flushPromises();

    await findButton(wrapper, "显示").trigger("click");
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("已到期应收¥0.00");
    expect(wrapper.text()).toContain("已到期已收¥0.00");
    expect(wrapper.text()).toContain("预收¥0.00");
  });

  it("keeps the initial unit contract fixed to annual billing and initial deposit collection", async () => {
    vi.mocked(unitsApi.create).mockResolvedValue(vacantUnit);
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateUnitDialog(wrapper);

    expect(wrapper.text()).toContain("按年");
    expect(wrapper.text()).toContain("首次收取");
    await wrapper.find('input[placeholder="例如 A-01"]').setValue("6");
    await wrapper.find('input[placeholder="例如 东区 1 号车间"]').setValue("空置厂房");
    await findInputByLabel(wrapper, "初始合同开始").setValue("2026-09-01");
    await findInputByLabel(wrapper, "初始合同年租金").setValue("50000");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(contractsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        billingFrequency: "annual",
        depositSettlementMode: "initial",
        depositCarryoverAmount: 0,
      }),
    );
    expect(vi.mocked(contractsApi.create).mock.calls[0][0]).not.toHaveProperty(
      "depositCarryoverSourceContractId",
    );
  });

  it("defaults a same-tenant renewal to carried deposit and previews semiannual periods", async () => {
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateContractDialog(wrapper);

    expect(depositsApi.listAccounts).toHaveBeenCalledWith({ unitId: "unit-1", tenantName: "曹忠" });
    expect(wrapper.get('[aria-label="押金处理方式"]').text()).toContain("沿用已有押金");
    await wrapper.get('[aria-label="收租周期-按半年"]').trigger("click");
    expect(wrapper.text()).toContain("预计 2 期");
    expect(wrapper.text()).toContain("首期到期日 2027-07-01");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(contractsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        billingFrequency: "semiannual",
        depositSettlementMode: "carryover",
        depositCarryoverAmount: 10000,
        depositCarryoverSourceContractId: "contract-old",
      }),
    );
  });

  it("resets carryover when the tenant changes and omits the source contract", async () => {
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateContractDialog(wrapper);

    await findInputByLabel(wrapper, "乙方名称").setValue(" 新租户 ");
    await flushPromises();
    expect(depositsApi.listAccounts).toHaveBeenLastCalledWith({ unitId: "unit-1", tenantName: "新租户" });
    expect(wrapper.get('[aria-label="押金处理方式"]').text()).toContain("首次收取");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    const payload = vi.mocked(contractsApi.create).mock.calls.at(-1)?.[0];
    expect(payload).toMatchObject({ depositSettlementMode: "initial", depositCarryoverAmount: 0 });
    expect(payload).not.toHaveProperty("depositCarryoverSourceContractId");
  });

  it("resets carryover immediately when the tenant is cleared", async () => {
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateContractDialog(wrapper);

    await findInputByLabel(wrapper, "乙方名称").setValue("");
    await flushPromises();
    expect(wrapper.get('[aria-label="押金处理方式"]').text()).toContain("首次收取");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    const payload = vi.mocked(contractsApi.create).mock.calls.at(-1)?.[0];
    expect(payload).toMatchObject({ depositSettlementMode: "initial", depositCarryoverAmount: 0 });
    expect(payload).not.toHaveProperty("depositCarryoverSourceContractId");
  });

  it("allows manually switching a renewal back to initial deposit collection", async () => {
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateContractDialog(wrapper);

    await wrapper.get('[aria-label="押金处理-首次收取"]').trigger("click");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    const payload = vi.mocked(contractsApi.create).mock.calls.at(-1)?.[0];
    expect(payload).toMatchObject({ depositSettlementMode: "initial", depositCarryoverAmount: 0 });
    expect(payload).not.toHaveProperty("depositCarryoverSourceContractId");
  });

  it("does not overwrite a manual initial choice when the pending account lookup resolves", async () => {
    const lookup = deferred<DepositAccountSummary[]>();
    vi.mocked(depositsApi.listAccounts).mockReturnValueOnce(lookup.promise);
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateContractDialog(wrapper);

    expect(wrapper.text()).toContain("正在核对押金账户");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(contractsApi.create).not.toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalledWith("押金账户正在查询，请稍后再保存");
    await wrapper.get('[aria-label="押金处理-首次收取"]').trigger("click");
    lookup.resolve([depositAccount]);
    await flushPromises();

    expect(wrapper.get('[aria-label="押金处理方式"]').text()).toContain("首次收取");
    expect(wrapper.text()).toContain("当前持有¥10,000.00");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    const payload = vi.mocked(contractsApi.create).mock.calls.at(-1)?.[0];
    expect(payload).toMatchObject({ depositSettlementMode: "initial", depositCarryoverAmount: 0 });
    expect(payload).not.toHaveProperty("depositCarryoverSourceContractId");
  });

  it("blocks renewal submit after account lookup failure and retries successfully", async () => {
    vi.mocked(depositsApi.listAccounts).mockRejectedValueOnce(new Error("network unavailable"));
    const retry = deferred<DepositAccountSummary[]>();
    vi.mocked(depositsApi.listAccounts).mockReturnValueOnce(retry.promise);
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateContractDialog(wrapper);

    expect(wrapper.text()).toContain("押金账户查询失败，请重试");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(contractsApi.create).not.toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalledWith("押金账户查询失败，请重试");

    await wrapper.get('[aria-label="重试押金账户查询"]').trigger("click");
    expect(wrapper.text()).toContain("正在核对押金账户");
    retry.resolve([depositAccount]);
    await flushPromises();
    expect(wrapper.get('[aria-label="押金处理方式"]').text()).toContain("沿用已有押金");

    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(contractsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        depositSettlementMode: "carryover",
        depositCarryoverSourceContractId: "contract-old",
      }),
    );
  });

  it("cannot reuse tenant A carryover while tenant B lookup is pending and uses B after success", async () => {
    const tenantBLookup = deferred<DepositAccountSummary[]>();
    vi.mocked(depositsApi.listAccounts)
      .mockResolvedValueOnce([depositAccount])
      .mockReturnValueOnce(tenantBLookup.promise);
    const tenantBAccount = {
      ...depositAccount,
      tenantName: "新租户",
      heldAmount: 7000,
      latestContractId: "contract-b",
    };
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateContractDialog(wrapper);
    expect(wrapper.get('[aria-label="押金结转来源合同"]').text()).toContain("contract-old");

    await findInputByLabel(wrapper, "乙方名称").setValue(" 新租户 ");
    await flushPromises();
    const carryoverButton = wrapper.get('[aria-label="押金处理-沿用已有押金"]');
    expect(carryoverButton.attributes("disabled")).toBeDefined();
    await carryoverButton.trigger("click");
    expect(wrapper.find('[aria-label="押金结转来源合同"]').exists()).toBe(false);
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(contractsApi.create).not.toHaveBeenCalled();

    tenantBLookup.resolve([tenantBAccount]);
    await flushPromises();
    expect(wrapper.get('[aria-label="押金结转来源合同"]').text()).toContain("contract-b");
    expect(wrapper.text()).toContain("已结转¥7,000.00");
    expect(wrapper.text()).not.toContain("contract-old");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(contractsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantName: "新租户",
        depositSettlementMode: "carryover",
        depositCarryoverAmount: 7000,
        depositCarryoverSourceContractId: "contract-b",
      }),
    );
  });

  it("cannot reuse tenant A carryover when tenant B lookup fails", async () => {
    const tenantBLookup = deferred<DepositAccountSummary[]>();
    vi.mocked(depositsApi.listAccounts)
      .mockResolvedValueOnce([depositAccount])
      .mockReturnValueOnce(tenantBLookup.promise);
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateContractDialog(wrapper);
    expect(wrapper.get('[aria-label="押金结转来源合同"]').text()).toContain("contract-old");

    await findInputByLabel(wrapper, "乙方名称").setValue("新租户");
    await flushPromises();
    const carryoverButton = wrapper.get('[aria-label="押金处理-沿用已有押金"]');
    expect(carryoverButton.attributes("disabled")).toBeDefined();
    await carryoverButton.trigger("click");
    tenantBLookup.reject(new Error("tenant B lookup failed"));
    await flushPromises();

    expect(wrapper.text()).toContain("押金账户查询失败，请重试");
    expect(wrapper.find('[aria-label="押金结转来源合同"]').exists()).toBe(false);
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(contractsApi.create).not.toHaveBeenCalled();
    expect(
      vi.mocked(contractsApi.create).mock.calls.some(
        ([payload]) => payload.depositCarryoverSourceContractId === "contract-old",
      ),
    ).toBe(false);
  });

  it("preserves an edited contract's saved deposit snapshot despite a newer account balance", async () => {
    const historicalContract: Contract = {
      ...oldContract,
      depositSettlementMode: "carryover",
      depositCarryoverAmount: 6000,
      depositCarryoverSourceContractId: "contract-source",
    };
    const historicalUnit = { ...unit, contracts: [historicalContract] };
    vi.mocked(unitsApi.list).mockResolvedValue([historicalUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(historicalUnit);
    vi.mocked(depositsApi.listAccounts).mockResolvedValue([
      { ...depositAccount, heldAmount: 8000, latestContractId: "contract-source" },
    ]);
    const wrapper = mountUnitsView();
    await flushPromises();
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "编辑").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("已结转¥6,000.00");
    expect(wrapper.text()).toContain("当前持有¥8,000.00");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(contractsApi.update).toHaveBeenCalledWith(
      "contract-old",
      expect.objectContaining({
        depositSettlementMode: "carryover",
        depositCarryoverAmount: 6000,
        depositCarryoverSourceContractId: "contract-source",
      }),
    );
  });

  it("allows editing other fields after account lookup fails without changing the saved snapshot", async () => {
    const historicalContract: Contract = {
      ...oldContract,
      depositSettlementMode: "carryover",
      depositCarryoverAmount: 6000,
      depositCarryoverSourceContractId: "contract-source",
    };
    const historicalUnit = { ...unit, contracts: [historicalContract] };
    vi.mocked(unitsApi.list).mockResolvedValue([historicalUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(historicalUnit);
    vi.mocked(depositsApi.listAccounts).mockRejectedValueOnce(new Error("network unavailable"));
    const wrapper = mountUnitsView();
    await flushPromises();
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "编辑").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("押金账户查询失败，请重试");
    expect(wrapper.text()).toContain("已结转¥6,000.00");
    await findInputByLabel(wrapper, "甲方联系人").setValue("新联系人");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(contractsApi.update).toHaveBeenCalledWith(
      "contract-old",
      expect.objectContaining({
        lessorContactName: "新联系人",
        depositSettlementMode: "carryover",
        depositCarryoverAmount: 6000,
        depositCarryoverSourceContractId: "contract-source",
      }),
    );
  });

  it("blocks an unchanged edited carryover while lookup is pending but allows it after failure", async () => {
    const lookup = deferred<DepositAccountSummary[]>();
    const historicalContract: Contract = {
      ...oldContract,
      depositSettlementMode: "carryover",
      depositCarryoverAmount: 6000,
      depositCarryoverSourceContractId: "contract-source",
    };
    const historicalUnit = { ...unit, contracts: [historicalContract] };
    vi.mocked(unitsApi.list).mockResolvedValue([historicalUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(historicalUnit);
    vi.mocked(depositsApi.listAccounts).mockReturnValueOnce(lookup.promise);
    const wrapper = mountUnitsView();
    await flushPromises();
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "编辑").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("正在核对押金账户");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(contractsApi.update).not.toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalledWith("押金账户正在查询，请稍后再保存");

    lookup.reject(new Error("network unavailable"));
    await flushPromises();
    expect(wrapper.text()).toContain("押金账户查询失败，请重试");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(contractsApi.update).toHaveBeenCalledWith(
      "contract-old",
      expect.objectContaining({
        depositSettlementMode: "carryover",
        depositCarryoverAmount: 6000,
        depositCarryoverSourceContractId: "contract-source",
      }),
    );
  });

  it("allows lookup failure fallback when an edited deposit amount remains equal in cents", async () => {
    const lookup = deferred<DepositAccountSummary[]>();
    const historicalContract: Contract = {
      ...oldContract,
      depositSettlementMode: "carryover",
      depositCarryoverAmount: 0.3,
      depositCarryoverSourceContractId: "contract-source",
    };
    const historicalUnit = { ...unit, contracts: [historicalContract] };
    vi.mocked(unitsApi.list).mockResolvedValue([historicalUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(historicalUnit);
    vi.mocked(depositsApi.listAccounts).mockReturnValueOnce(lookup.promise);
    const wrapper = mountUnitsView();
    await flushPromises();
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "编辑").trigger("click");
    await flushPromises();

    setDepositCarryoverAmount(wrapper, 0.30000000000000004);
    await findInputByLabel(wrapper, "甲方联系人").setValue("新联系人");
    lookup.reject(new Error("network unavailable"));
    await flushPromises();
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(contractsApi.update).toHaveBeenCalledWith(
      "contract-old",
      expect.objectContaining({
        lessorContactName: "新联系人",
        depositSettlementMode: "carryover",
        depositCarryoverAmount: 0.30000000000000004,
        depositCarryoverSourceContractId: "contract-source",
      }),
    );
  });

  it("blocks lookup failure fallback when an edited deposit amount differs by one cent", async () => {
    const lookup = deferred<DepositAccountSummary[]>();
    const historicalContract: Contract = {
      ...oldContract,
      depositSettlementMode: "carryover",
      depositCarryoverAmount: 0.3,
      depositCarryoverSourceContractId: "contract-source",
    };
    const historicalUnit = { ...unit, contracts: [historicalContract] };
    vi.mocked(unitsApi.list).mockResolvedValue([historicalUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(historicalUnit);
    vi.mocked(depositsApi.listAccounts).mockReturnValueOnce(lookup.promise);
    const wrapper = mountUnitsView();
    await flushPromises();
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "编辑").trigger("click");
    await flushPromises();

    setDepositCarryoverAmount(wrapper, 0.31);
    lookup.reject(new Error("network unavailable"));
    await flushPromises();
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(contractsApi.update).not.toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalledWith("押金账户查询失败，请重试");
  });

  it("does not allow lookup failure fallback after changing an edited deposit mode", async () => {
    const lookup = deferred<DepositAccountSummary[]>();
    const historicalContract: Contract = {
      ...oldContract,
      depositSettlementMode: "carryover",
      depositCarryoverAmount: 6000,
      depositCarryoverSourceContractId: "contract-source",
    };
    const historicalUnit = { ...unit, contracts: [historicalContract] };
    vi.mocked(unitsApi.list).mockResolvedValue([historicalUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(historicalUnit);
    vi.mocked(depositsApi.listAccounts).mockReturnValueOnce(lookup.promise);
    const wrapper = mountUnitsView();
    await flushPromises();
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "编辑").trigger("click");
    await flushPromises();

    await wrapper.get('[aria-label="押金处理-首次收取"]').trigger("click");
    lookup.reject(new Error("network unavailable"));
    await flushPromises();
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(contractsApi.update).not.toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalledWith("押金账户查询失败，请重试");
  });

  it("does not allow lookup failure fallback after changing an edited tenant", async () => {
    const tenantLookup = deferred<DepositAccountSummary[]>();
    const historicalContract: Contract = {
      ...oldContract,
      depositSettlementMode: "carryover",
      depositCarryoverAmount: 6000,
      depositCarryoverSourceContractId: "contract-source",
    };
    const historicalUnit = { ...unit, contracts: [historicalContract] };
    vi.mocked(unitsApi.list).mockResolvedValue([historicalUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(historicalUnit);
    vi.mocked(depositsApi.listAccounts)
      .mockResolvedValueOnce([
        { ...depositAccount, heldAmount: 6000, latestContractId: "contract-source" },
      ])
      .mockReturnValueOnce(tenantLookup.promise);
    const wrapper = mountUnitsView();
    await flushPromises();
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "编辑").trigger("click");
    await flushPromises();

    await findInputByLabel(wrapper, "乙方名称").setValue("新租户");
    tenantLookup.reject(new Error("network unavailable"));
    await flushPromises();
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(contractsApi.update).not.toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalledWith("押金账户查询失败，请重试");
  });

  it("shows the latest source contract as read-only audit information", async () => {
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateContractDialog(wrapper);

    expect(wrapper.find('select[aria-label="押金结转来源合同"]').exists()).toBe(false);
    expect(wrapper.get('[aria-label="押金结转来源合同"]').text()).toContain("contract-old");
  });

  it("isolates account lookup state after closing and reopening the contract dialog", async () => {
    const staleLookup = deferred<DepositAccountSummary[]>();
    vi.mocked(depositsApi.listAccounts)
      .mockReturnValueOnce(staleLookup.promise)
      .mockResolvedValueOnce([depositAccount]);
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateContractDialog(wrapper);
    await wrapper.get('[aria-label="押金处理-首次收取"]').trigger("click");
    await findButton(wrapper, "取消").trigger("click");
    await openCreateContractDialog(wrapper);
    await flushPromises();

    expect(wrapper.get('[aria-label="押金处理方式"]').text()).toContain("沿用已有押金");
    staleLookup.resolve([{ ...depositAccount, heldAmount: 7000 }]);
    await flushPromises();
    expect(wrapper.text()).toContain("已结转¥10,000.00");
    expect(wrapper.text()).not.toContain("押金账户查询失败，请重试");
  });

  it("loads contract receivable periods in the schedule dialog", async () => {
    const wrapper = mountUnitsView();
    await flushPromises();
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "查看期次").trigger("click");
    await flushPromises();

    expect(rentReceivablesApi.list).toHaveBeenCalledWith({ contractId: "contract-old" });
    expect(wrapper.text()).toContain("第 1 期");
    expect(wrapper.text()).toContain("2026-07-01");
    expect(wrapper.text()).toContain("已结清");
  });

  it("ignores a late schedule success after closing contract A and opening contract B", async () => {
    const contractB = { ...savedContract, id: "contract-second", startDate: "2028-07-01", endDate: "2029-06-30" };
    const twoContractUnit = { ...unit, contracts: [oldContract, contractB] };
    const requestA = deferred<{ items: RentReceivable[] }>();
    const requestB = deferred<{ items: RentReceivable[] }>();
    vi.mocked(unitsApi.list).mockResolvedValue([twoContractUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(twoContractUnit);
    vi.mocked(rentReceivablesApi.list).mockImplementation((query) =>
      query.contractId === "contract-old" ? requestA.promise : requestB.promise,
    );
    const wrapper = mountUnitsView();
    await flushPromises();
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();

    const viewScheduleButtons = wrapper.findAll("button").filter((button) => button.text() === "查看期次");
    await viewScheduleButtons[0].trigger("click");
    await findButton(wrapper, "关闭").trigger("click");
    await viewScheduleButtons[1].trigger("click");
    requestA.resolve({ items: [receivable] });
    await flushPromises();
    expect(wrapper.text()).toContain("正在加载期次");
    expect(wrapper.get(".rent-schedule-table").text()).not.toContain("第 1 期");

    requestB.resolve({ items: [secondReceivable] });
    await flushPromises();
    expect(wrapper.text()).toContain("2028-07-01");
    expect(wrapper.text()).not.toContain("正在加载期次");
  });

  it("shows an error for the current schedule request", async () => {
    vi.mocked(rentReceivablesApi.list).mockRejectedValueOnce(new Error("期次接口不可用"));
    const wrapper = mountUnitsView();
    await flushPromises();
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "查看期次").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("期次接口不可用");
    expect(wrapper.text()).not.toContain("正在加载期次");
    expect(ElMessage.error).toHaveBeenCalledWith("期次接口不可用");
  });

  it("ignores a late schedule error and finally after contract B starts loading", async () => {
    const contractB = { ...savedContract, id: "contract-second", startDate: "2028-07-01", endDate: "2029-06-30" };
    const twoContractUnit = { ...unit, contracts: [oldContract, contractB] };
    const requestA = deferred<{ items: RentReceivable[] }>();
    const requestB = deferred<{ items: RentReceivable[] }>();
    vi.mocked(unitsApi.list).mockResolvedValue([twoContractUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(twoContractUnit);
    vi.mocked(rentReceivablesApi.list).mockImplementation((query) =>
      query.contractId === "contract-old" ? requestA.promise : requestB.promise,
    );
    const wrapper = mountUnitsView();
    await flushPromises();
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();

    const viewScheduleButtons = wrapper.findAll("button").filter((button) => button.text() === "查看期次");
    await viewScheduleButtons[0].trigger("click");
    await findButton(wrapper, "关闭").trigger("click");
    await viewScheduleButtons[1].trigger("click");
    requestA.reject(new Error("stale schedule failure"));
    await flushPromises();
    expect(wrapper.text()).toContain("正在加载期次");
    expect(ElMessage.error).not.toHaveBeenCalledWith("stale schedule failure");

    requestB.resolve({ items: [secondReceivable] });
    await flushPromises();
    expect(wrapper.text()).toContain("2028-07-01");
    expect(wrapper.text()).not.toContain("正在加载期次");
  });

  it("keeps rent payment mutation and list return types distinct", () => {
    expectTypeOf<Awaited<ReturnType<typeof rentPaymentsApi.list>>>().toEqualTypeOf<RentPayment[]>();
    expectTypeOf<Awaited<ReturnType<typeof rentPaymentsApi.create>>>().toEqualTypeOf<RentPaymentMutationResult>();
    expectTypeOf<Awaited<ReturnType<typeof rentPaymentsApi.update>>>().toEqualTypeOf<RentPaymentMutationResult>();
    expectTypeOf<Awaited<ReturnType<typeof rentPaymentsApi.remove>>>().toEqualTypeOf<RentPaymentMutationResult>();
    expectTypeOf<Awaited<ReturnType<typeof rentPaymentsApi.previewAllocation>>>().toEqualTypeOf<RentPaymentAllocationPreview>();
    expectTypeOf<Awaited<ReturnType<typeof depositsApi.listAccounts>>>().toEqualTypeOf<DepositAccountSummary[]>();
    expectTypeOf<Awaited<ReturnType<typeof rentReceivablesApi.list>>>().toEqualTypeOf<{ items: RentReceivable[] }>();
  });

  it("defaults a new contract deposit from the previous contract and submits it", async () => {
    const wrapper = mountUnitsView();
    await flushPromises();

    await openCreateContractDialog(wrapper);

    const depositInput = wrapper.find('input[aria-label="押金"]');
    expect(depositInput.exists()).toBe(true);
    expect((depositInput.element as HTMLInputElement).value).toBe("10000");
    expect((findInputByLabel(wrapper, "甲方名称").element as HTMLInputElement).value).toBe(
      "江阴市示例产业园有限公司",
    );
    expect((findInputByLabel(wrapper, "甲方营业执照代码").element as HTMLInputElement).value).toBe(
      "91320281TEST000001",
    );
    expect((findInputByLabel(wrapper, "甲方联系人").element as HTMLInputElement).value).toBe("吴孝斌");
    expect((findInputByLabel(wrapper, "甲方电话").element as HTMLInputElement).value).toBe("18651510352");

    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(contractsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lessorName: "江阴市示例产业园有限公司",
        lessorLicenseCode: "91320281TEST000001",
        lessorContactName: "吴孝斌",
        lessorPhone: "18651510352",
        annualRent: 50000,
        depositAmount: 10000,
      }),
    );
  });

  it("uses empty lessor identity with default contact details when no previous contract exists", async () => {
    vi.mocked(unitsApi.list).mockResolvedValue([vacantUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(vacantUnit);
    const wrapper = mountUnitsView();
    await flushPromises();

    await openCreateContractDialog(wrapper);

    expect((findInputByLabel(wrapper, "甲方名称").element as HTMLInputElement).value).toBe("");
    expect((findInputByLabel(wrapper, "甲方营业执照代码").element as HTMLInputElement).value).toBe("");
    expect((findInputByLabel(wrapper, "甲方联系人").element as HTMLInputElement).value).toBe("吴孝斌");
    expect((findInputByLabel(wrapper, "甲方电话").element as HTMLInputElement).value).toBe("18651510352");
  });

  it("allows all party identity fields to be empty", async () => {
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateContractDialog(wrapper);

    for (const label of [
      "甲方名称",
      "甲方营业执照代码",
      "甲方联系人",
      "甲方电话",
      "乙方名称",
      "乙方营业执照代码",
      "乙方联系人",
      "乙方电话",
    ]) {
      await findInputByLabel(wrapper, label).setValue("");
    }

    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(contractsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lessorName: "",
        lessorLicenseCode: "",
        lessorContactName: "",
        lessorPhone: "",
        tenantName: "",
        licenseCode: "",
        contactName: "",
        tenantPhone: "",
      }),
    );
  });

  it("does not create an initial contract from untouched lessor defaults", async () => {
    vi.mocked(unitsApi.create).mockResolvedValue(vacantUnit);
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateUnitDialog(wrapper);

    await wrapper.find('input[placeholder="例如 A-01"]').setValue("6");
    await wrapper.find('input[placeholder="例如 东区 1 号车间"]').setValue("空置厂房");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(unitsApi.create).toHaveBeenCalledTimes(1);
    expect(contractsApi.create).not.toHaveBeenCalled();
  });

  it("submits lessor information with an initial contract", async () => {
    vi.mocked(unitsApi.create).mockResolvedValue(vacantUnit);
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateUnitDialog(wrapper);

    await wrapper.find('input[placeholder="例如 A-01"]').setValue("6");
    await wrapper.find('input[placeholder="例如 东区 1 号车间"]').setValue("空置厂房");
    await findInputByLabel(wrapper, "初始合同甲方名称").setValue("江阴市示例产业园有限公司");
    await findInputByLabel(wrapper, "初始合同甲方营业执照代码").setValue("91320281TEST000001");
    await findInputByLabel(wrapper, "初始合同开始").setValue("2026-09-01");
    await findInputByLabel(wrapper, "初始合同年租金").setValue("50000");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(contractsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lessorName: "江阴市示例产业园有限公司",
        lessorLicenseCode: "91320281TEST000001",
        lessorContactName: "吴孝斌",
        lessorPhone: "18651510352",
        startDate: "2026-09-01",
        endDate: "2027-08-31",
        annualRent: 50000,
      }),
    );
  });

  it("downloads a newly saved contract without pre-generating the document twice", async () => {
    const downloadNames: string[] = [];
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadNames.push(this.download);
      });
    const wrapper = mountUnitsView();
    await flushPromises();

    await openCreateContractDialog(wrapper);
    await fillAnnualRent(wrapper, "50000");

    await findButton(wrapper, "保存并下载合同").trigger("click");
    await flushPromises();

    expect(contractsApi.create).toHaveBeenCalledTimes(1);
    expect(contractsApi.generateDocument).not.toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(downloadNames).toEqual(["厂房租赁合同_曹忠_2027-07-01_2028-06-30.pdf"]);
    expect(ElMessage.success).toHaveBeenCalledWith("合同已新增并已下载合同文件");

    anchorClick.mockRestore();
  });

  it("ignores repeated save-and-download clicks while the contract is being saved", async () => {
    let resolveCreate: (contract: Contract) => void = () => undefined;
    vi.mocked(contractsApi.create).mockReturnValue(
      new Promise<Contract>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const wrapper = mountUnitsView();
    await flushPromises();

    await openCreateContractDialog(wrapper);
    await fillAnnualRent(wrapper, "50000");

    const saveAndDownloadButton = findButton(wrapper, "保存并下载合同");
    await saveAndDownloadButton.trigger("click");
    await saveAndDownloadButton.trigger("click");
    resolveCreate(savedContract);
    await flushPromises();

    expect(contractsApi.create).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);

    anchorClick.mockRestore();
  });

  it("downloads an existing contract without pre-generating the document twice", async () => {
    const downloadNames: string[] = [];
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadNames.push(this.download);
      });
    const wrapper = mountUnitsView();
    await flushPromises();

    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "下载合同").trigger("click");
    await flushPromises();

    expect(contractsApi.generateDocument).not.toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(downloadNames).toEqual(["厂房租赁合同_曹忠_2026-07-01_2027-06-30.pdf"]);
    expect(ElMessage.success).toHaveBeenCalledWith("合同已开始下载");

    anchorClick.mockRestore();
  });
});
