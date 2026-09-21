import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, provide, inject, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import UnitsView from "./UnitsView.vue";
import { contractsApi, depositsApi, filesApi, rentPaymentsApi, rentReceivablesApi, unitsApi } from "../api";
import type {
  Contract,
  RentPayment,
  RentPaymentAllocationPreview,
  RentPaymentMutationResult,
  RentReceivable,
  UnitSummary,
  UnitPage,
  StoredFile,
} from "../types/models";

const viewport = vi.hoisted(() => ({ width: 1280 }));
enableAutoUnmount(afterEach);

vi.mock("../api", () => ({
  contractsApi: {
    create: vi.fn(),
    update: vi.fn(),
    addAttachments: vi.fn(),
    generateDocument: vi.fn(),
    documentStatus: vi.fn(),
    retryDocument: vi.fn(),
    history: vi.fn(),
  },
  depositsApi: {
    listAccounts: vi.fn(),
  },
  filesApi: {
    upload: vi.fn(),
  },
  unitsApi: {
    list: vi.fn(),
    page: vi.fn(),
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
    info: vi.fn(),
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
  useViewportWidth: () => ref(viewport.width),
}));

const activeContract = {
  id: "contract-old",
  lessorName: "江阴市示例产业园有限公司",
  lessorLicenseCode: "91320281TEST000001",
  lessorContactName: "吴孝斌",
  lessorPhone: "18651510352",
  lessorSafetyManager: "吴孝斌",
  tenantName: "曹忠",
  contactName: "曹忠",
  tenantPhone: "15951506512",
  licenseCode: "",
  tenantSafetyManager: "曹忠",
  signedDate: "2026-06-28",
  startDate: "2026-07-01",
  endDate: "2027-06-30",
  annualRent: 50000,
  depositAmount: 5000,
  electricUnitPrice: 0.95,
  electricLineLossPercent: 5,
  waterUnitPrice: 1,
  earlyTerminationPenaltyAmount: 4166.67,
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
} as NonNullable<UnitSummary["activeContract"]>;

const oldContract = {
  id: "contract-old",
  unitId: "unit-1",
  lessorName: "江阴市示例产业园有限公司",
  lessorLicenseCode: "91320281TEST000001",
  lessorContactName: "吴孝斌",
  lessorPhone: "18651510352",
  lessorSafetyManager: "吴孝斌",
  tenantName: "曹忠",
  contactName: "曹忠",
  tenantPhone: "15951506512",
  licenseCode: "",
  tenantSafetyManager: "曹忠",
  signedDate: "2026-06-28",
  startDate: "2026-07-01",
  endDate: "2027-06-30",
  annualRent: 50000,
  depositAmount: 5000,
  electricUnitPrice: 0.95,
  electricLineLossPercent: 5,
  waterUnitPrice: 1,
  earlyTerminationPenaltyAmount: 4166.67,
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
} as Contract;

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
  lessorSafetyManager: "吴孝斌",
  tenantName: "曹忠",
  contactName: "曹忠",
  tenantPhone: "15951506512",
  licenseCode: "",
  tenantSafetyManager: "曹忠",
  signedDate: "2027-06-28",
  startDate: "2027-07-01",
  endDate: "2028-06-30",
  annualRent: 50000,
  depositAmount: 5000,
  electricUnitPrice: 0.95,
  electricLineLossPercent: 5,
  waterUnitPrice: 1,
  earlyTerminationPenaltyAmount: 4166.67,
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
} as Contract;

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
        "el-pagination": defineComponent({
          props: ["currentPage", "pageSize", "total", "layout"],
          emits: ["current-change", "size-change"],
          setup(props, { emit }) {
            return () => h("div", { "data-pagination-layout": props.layout }, [
              h("span", `第 ${props.currentPage} 页，共 ${props.total} 条`),
              h("button", { onClick: () => emit("current-change", Number(props.currentPage) + 1) }, "下一页"),
              h("button", { onClick: () => emit("size-change", 50) }, "每页 50 条"),
            ]);
          },
        }),
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

function unitPage(items: UnitSummary[], overrides: Partial<UnitPage> = {}): UnitPage {
  return {
    items: items.map(({ id, code, location, area, status, activeContract, contractCount, contracts }) => ({
      id, code, location, area, status, activeContract, contractCount,
      outstandingAmount: contracts.reduce((sum, contract) => sum + contract.outstandingAmount, 0),
    })),
    page: 1,
    pageSize: 20,
    total: items.length,
    stats: {
      occupiedCount: items.filter((item) => ["occupied", "expiring"].includes(item.status)).length,
      vacantCount: items.filter((item) => item.status === "vacant").length,
      expiringCount: items.filter((item) => item.status === "expiring").length,
      expiredCount: items.filter((item) => item.status === "expired").length,
      activeRentSum: items.reduce((sum, item) => sum + Number(item.activeContract?.annualRent ?? 0), 0),
    },
    ...overrides,
  };
}

function mockUnitsPage(items: UnitSummary[]) {
  vi.mocked(unitsApi.page).mockResolvedValue(unitPage(items));
}

describe("UnitsView contract download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewport.width = 1280;
    vi.mocked(contractsApi.documentStatus).mockImplementation(async (contractId) => ({
      contractId, revision: "revision-1", status: "ready", attempts: 1, error: null, updatedAt: "2026-09-14T00:00:00.000Z",
    }));
    vi.mocked(contractsApi.history).mockResolvedValue([]);
    mockUnitsPage([unit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(unit);
    vi.mocked(contractsApi.create).mockResolvedValue(savedContract);
    vi.mocked(contractsApi.update).mockResolvedValue(savedContract);
    vi.mocked(depositsApi.listAccounts).mockResolvedValue([]);
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

  it("loads only a summary page until management is opened and keeps server totals", async () => {
    vi.mocked(unitsApi.page).mockResolvedValue(unitPage([unit], {
      total: 41,
      stats: { occupiedCount: 30, vacantCount: 5, expiringCount: 2, expiredCount: 6, activeRentSum: 900000 },
    }));
    const wrapper = mountUnitsView();
    await flushPromises();
    expect(unitsApi.page).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(unitsApi.list).not.toHaveBeenCalled();
    expect(unitsApi.detail).not.toHaveBeenCalled();
    expect(wrapper.findAll(".stat-item strong").map((item) => item.text())).toEqual(["41", "30", "5", "2", "6", "*****"]);
    await findButton(wrapper, "下一页").trigger("click");
    await flushPromises();
    expect(unitsApi.page).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 });
    expect(wrapper.find(".stat-item strong").text()).toBe("41");
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    expect(unitsApi.detail).toHaveBeenCalledTimes(1);
    expect(unitsApi.detail).toHaveBeenCalledWith("unit-1");
    wrapper.unmount();
  });

  it("returns to the last valid page after deleting its only item", async () => {
    vi.mocked(unitsApi.page)
      .mockResolvedValueOnce(unitPage([unit], { total: 21 }))
      .mockResolvedValueOnce(unitPage([vacantUnit], { page: 2, total: 21 }))
      .mockResolvedValueOnce(unitPage([], { page: 2, total: 20 }))
      .mockResolvedValueOnce(unitPage([unit], { total: 20 }));
    vi.mocked(ElMessageBox.confirm).mockResolvedValue("confirm" as Awaited<ReturnType<typeof ElMessageBox.confirm>>);
    vi.mocked(unitsApi.remove).mockResolvedValue({ success: true });
    const wrapper = mountUnitsView();
    await flushPromises();
    await findButton(wrapper, "下一页").trigger("click");
    await flushPromises();
    await findButton(wrapper, "删除").trigger("click");
    await flushPromises();
    expect(unitsApi.remove).toHaveBeenCalledWith(vacantUnit.id);
    expect(unitsApi.page).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 });
    expect(wrapper.text()).toContain("第 1 页，共 20 条");
    wrapper.unmount();
  });

  it("ignores stale pages and resets the page when the page size changes", async () => {
    const oldPage = deferred<UnitPage>();
    vi.mocked(unitsApi.page)
      .mockReturnValueOnce(oldPage.promise)
      .mockResolvedValueOnce(unitPage([vacantUnit], { page: 2, total: 41 }))
      .mockResolvedValueOnce(unitPage([unit], { pageSize: 50, total: 41 }));
    const wrapper = mountUnitsView();
    await findButton(wrapper, "下一页").trigger("click");
    await flushPromises();
    oldPage.resolve(unitPage([unit], { total: 41 }));
    await flushPromises();
    expect(wrapper.text()).toContain("空置厂房");
    expect(wrapper.text()).not.toContain("测试厂房");
    await findButton(wrapper, "每页 50 条").trigger("click");
    await flushPromises();
    expect(unitsApi.page).toHaveBeenLastCalledWith({ page: 1, pageSize: 50 });
    wrapper.unmount();
  });

  it("uses compact pagination on mobile while preserving the create form", async () => {
    viewport.width = 390;
    const wrapper = mountUnitsView();
    await flushPromises();
    expect(wrapper.find("[data-pagination-layout]").attributes("data-pagination-layout")).toBe("prev, pager, next");
    await openCreateUnitDialog(wrapper);
    expect(wrapper.find('input[aria-label="初始合同甲方名称"]').element).toHaveProperty("value", "吴孝斌");
    expect(wrapper.find('input[aria-label="初始合同押金"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("keeps existing attachments while adding an upload in the shared edit form", async () => {
    const attachment: StoredFile = {
      id: "attachment-old", originalName: "signed.pdf", mimeType: "application/pdf", size: 100,
      category: "contract-attachment", storagePath: "test/signed.pdf",
    };
    const license: StoredFile = { ...attachment, id: "license-old", category: "business-license" };
    vi.mocked(unitsApi.detail).mockResolvedValue({
      ...unit, contracts: [{ ...oldContract, businessLicenseFile: license, attachmentFiles: [attachment] }],
    });
    vi.mocked(filesApi.upload).mockResolvedValue([{ ...attachment, id: "attachment-new" }]);
    const wrapper = mountUnitsView();
    await flushPromises();
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "编辑").trigger("click");
    await flushPromises();
    const upload = new File(["new attachment"], "new.pdf", { type: "application/pdf" });
    const input = wrapper.findAll('input[type="file"]').find((item) => item.attributes("multiple") !== undefined)!;
    Object.defineProperty(input.element, "files", { value: [upload], configurable: true });
    await input.trigger("change");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(filesApi.upload).toHaveBeenCalledWith([upload], "contract-attachment");
    expect(contractsApi.update).toHaveBeenCalledWith(oldContract.id, expect.objectContaining({
      businessLicenseFileId: "license-old", attachmentFileIds: ["attachment-old", "attachment-new"],
    }));
  });

  it("合同列表直接提供已签合同上传入口，不再展示查看期次", async () => {
    const wrapper = mountUnitsView();
    await flushPromises();
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    expect(wrapper.text()).not.toContain("查看期次");
    expect(wrapper.text()).not.toContain("金额历史");
    expect(contractsApi.history).not.toHaveBeenCalled();
    await findButton(wrapper, "上传已签合同").trigger("click");
    expect(wrapper.find('[aria-label="选择已签合同文件"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("曹忠");
  });

  it("shows annual rent and due amounts in contract history", async () => {
    const accruedContract = Object.assign({}, oldContract, {
      billingFrequency: "semiannual",
      dueReceivableAmount: 100000,
      prepaidAmount: 25000,
    }) as Contract;
    const accruedUnit = {
      ...unit,
      contracts: [accruedContract],
    };
    mockUnitsPage([accruedUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(accruedUnit);
    const wrapper = mountUnitsView();
    await flushPromises();

    await findButton(wrapper, "显示").trigger("click");
    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("已到期应收");
    expect(wrapper.text()).toContain("年租金");
    expect(wrapper.text()).not.toContain("收租周期");
    expect(wrapper.text()).toContain("¥100,000.00");
    expect(wrapper.text()).toContain("¥25,000.00");
  });

  it("renders zero contract summary amounts instead of placeholders", async () => {
    const zeroUnit = { ...unit, activeContract: savedContract, contracts: [savedContract] };
    mockUnitsPage([zeroUnit]);
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


  it("keeps rent payment mutation and list return types distinct", () => {
    expectTypeOf<Awaited<ReturnType<typeof rentPaymentsApi.list>>>().toEqualTypeOf<RentPayment[]>();
    expectTypeOf<Awaited<ReturnType<typeof rentPaymentsApi.create>>>().toEqualTypeOf<RentPaymentMutationResult>();
    expectTypeOf<Awaited<ReturnType<typeof rentPaymentsApi.update>>>().toEqualTypeOf<RentPaymentMutationResult>();
    expectTypeOf<Awaited<ReturnType<typeof rentPaymentsApi.remove>>>().toEqualTypeOf<RentPaymentMutationResult>();
    expectTypeOf<Awaited<ReturnType<typeof rentPaymentsApi.previewAllocation>>>().toEqualTypeOf<RentPaymentAllocationPreview>();
    expectTypeOf<Awaited<ReturnType<typeof rentReceivablesApi.list>>>().toEqualTypeOf<{ items: RentReceivable[] }>();
  });

  it("defaults a renewal deposit from the previous contract and allows manually setting it to zero", async () => {
    const wrapper = mountUnitsView();
    await flushPromises();

    await openCreateContractDialog(wrapper);

    const depositInput = wrapper.find('input[aria-label="押金"]');
    expect(depositInput.exists()).toBe(true);
    expect((depositInput.element as HTMLInputElement).value).toBe("5000");
    expect(wrapper.text()).not.toContain("押金处理");
    expect(depositsApi.listAccounts).not.toHaveBeenCalled();
    expect((findInputByLabel(wrapper, "甲方名称").element as HTMLInputElement).value).toBe(
      "江阴市示例产业园有限公司",
    );
    expect((findInputByLabel(wrapper, "甲方营业执照代码").element as HTMLInputElement).value).toBe(
      "91320281TEST000001",
    );
    expect((findInputByLabel(wrapper, "甲方联系人").element as HTMLInputElement).value).toBe("吴孝斌");
    expect((findInputByLabel(wrapper, "甲方电话").element as HTMLInputElement).value).toBe("18651510352");
    expect((findInputByLabel(wrapper, "甲方安全管理负责人").element as HTMLInputElement).value).toBe("吴孝斌");
    expect((findInputByLabel(wrapper, "乙方安全管理负责人").element as HTMLInputElement).value).toBe("曹忠");
    expect((findInputByLabel(wrapper, "合同签订日期").element as HTMLInputElement).value).toBe("2027-07-01");
    expect((findInputByLabel(wrapper, "提前退租违约金").element as HTMLInputElement).value).toBe("4166.67");
    expect((findInputByLabel(wrapper, "电费单价（元/度）").element as HTMLInputElement).value).toBe("0.95");
    expect((findInputByLabel(wrapper, "电费线损（%）").element as HTMLInputElement).value).toBe("5");
    expect((findInputByLabel(wrapper, "水费单价（元/吨）").element as HTMLInputElement).value).toBe("1");

    await depositInput.setValue("0");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    const payload = vi.mocked(contractsApi.create).mock.calls.at(-1)?.[0];
    expect(payload).toEqual(
      expect.objectContaining({
        lessorName: "江阴市示例产业园有限公司",
        lessorLicenseCode: "91320281TEST000001",
        lessorContactName: "吴孝斌",
        lessorPhone: "18651510352",
        lessorSafetyManager: "吴孝斌",
        tenantSafetyManager: "曹忠",
        signedDate: "2027-07-01",
        annualRent: 50000,
        depositAmount: 0,
        electricUnitPrice: 0.95,
        electricLineLossPercent: 5,
        waterUnitPrice: 1,
        earlyTerminationPenaltyAmount: 4166.67,
      }),
    );
    expect(payload).not.toHaveProperty("depositSettlementMode");
    expect(payload).not.toHaveProperty("depositCarryoverAmount");
    expect(payload).not.toHaveProperty("depositCarryoverSourceContractId");
  });

  it("多年新合同默认按年记录，编辑旧的半年合同不改变原收费规则", async () => {
    vi.mocked(unitsApi.detail).mockResolvedValue({ ...unit, contracts: [{ ...oldContract, billingFrequency: "semiannual" }] });
    const wrapper = mountUnitsView();
    await flushPromises();
    await openCreateContractDialog(wrapper);
    await findInputByLabel(wrapper, "合同结束").setValue("2030-06-30");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(contractsApi.create).toHaveBeenCalledWith(expect.objectContaining({
      startDate: "2027-07-01", endDate: "2030-06-30", billingFrequency: "annual",
    }));
    await findButton(wrapper, "编辑").trigger("click");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();
    expect(contractsApi.update).toHaveBeenCalledWith(oldContract.id, expect.objectContaining({ billingFrequency: "semiannual" }));
  });

  it("uses the individual lessor and safety manager defaults when no previous contract exists", async () => {
    mockUnitsPage([vacantUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(vacantUnit);
    const wrapper = mountUnitsView();
    await flushPromises();

    await openCreateContractDialog(wrapper);

    expect((findInputByLabel(wrapper, "甲方名称").element as HTMLInputElement).value).toBe("吴孝斌");
    expect((findInputByLabel(wrapper, "甲方营业执照代码").element as HTMLInputElement).value).toBe("");
    expect((findInputByLabel(wrapper, "甲方联系人").element as HTMLInputElement).value).toBe("吴孝斌");
    expect((findInputByLabel(wrapper, "甲方电话").element as HTMLInputElement).value).toBe("18651510352");
    expect((findInputByLabel(wrapper, "甲方安全管理负责人").element as HTMLInputElement).value).toBe("吴孝斌");
  });

  it("defaults utility terms from enabled meters when no previous contract exists", async () => {
    const meteredVacantUnit = {
      ...vacantUnit,
      meterConfigs: [
        {
          id: "electric-meter",
          unitId: vacantUnit.id,
          type: "electric" as const,
          name: "总电表",
          initialReading: 0,
          multiplier: 1,
          unitPrice: 0.88,
          lineLossPercent: 3,
          enabled: true,
        },
        {
          id: "water-meter",
          unitId: vacantUnit.id,
          type: "water" as const,
          name: "总水表",
          initialReading: 0,
          multiplier: 1,
          unitPrice: 1.2,
          lineLossPercent: 0,
          enabled: true,
        },
      ],
    } satisfies UnitSummary;
    mockUnitsPage([meteredVacantUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(meteredVacantUnit);
    const wrapper = mountUnitsView();
    await flushPromises();

    await openCreateContractDialog(wrapper);

    expect((findInputByLabel(wrapper, "电费单价（元/度）").element as HTMLInputElement).value).toBe("0.88");
    expect((findInputByLabel(wrapper, "电费线损（%）").element as HTMLInputElement).value).toBe("3");
    expect((findInputByLabel(wrapper, "水费单价（元/吨）").element as HTMLInputElement).value).toBe("1.2");
  });

  it("defaults safety managers to the contacts when creating a contract", async () => {
    mockUnitsPage([vacantUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(vacantUnit);
    const wrapper = mountUnitsView();
    await flushPromises();

    await openCreateContractDialog(wrapper);
    await findInputByLabel(wrapper, "甲方联系人").setValue("甲方联系人甲");
    await findInputByLabel(wrapper, "乙方联系人").setValue("乙方联系人乙");
    await flushPromises();

    expect((findInputByLabel(wrapper, "甲方安全管理负责人").element as HTMLInputElement).value).toBe(
      "甲方联系人甲",
    );
    expect((findInputByLabel(wrapper, "乙方安全管理负责人").element as HTMLInputElement).value).toBe(
      "乙方联系人乙",
    );
  });

  it("uses the contacts instead of prior safety managers for a renewal", async () => {
    const previousContract = {
      ...oldContract,
      lessorSafetyManager: "上一期甲方安全员",
      tenantSafetyManager: "上一期乙方安全员",
    } as Contract;
    const renewalUnit = {
      ...unit,
      contracts: [previousContract],
    } satisfies UnitSummary;
    mockUnitsPage([renewalUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(renewalUnit);
    const wrapper = mountUnitsView();
    await flushPromises();

    await openCreateContractDialog(wrapper);

    expect((findInputByLabel(wrapper, "甲方安全管理负责人").element as HTMLInputElement).value).toBe(
      "吴孝斌",
    );
    expect((findInputByLabel(wrapper, "乙方安全管理负责人").element as HTMLInputElement).value).toBe("曹忠");
  });

  it("defaults initial-contract safety managers to the contacts", async () => {
    const wrapper = mountUnitsView();
    await flushPromises();

    await openCreateUnitDialog(wrapper);
    await findInputByLabel(wrapper, "初始合同甲方联系人").setValue("初始甲方联系人");
    await findInputByLabel(wrapper, "初始合同乙方联系人").setValue("初始乙方联系人");
    await flushPromises();

    expect(
      (findInputByLabel(wrapper, "初始合同甲方安全管理负责人").element as HTMLInputElement).value,
    ).toBe("初始甲方联系人");
    expect(
      (findInputByLabel(wrapper, "初始合同乙方安全管理负责人").element as HTMLInputElement).value,
    ).toBe("初始乙方联系人");
  });

  it("does not overwrite a manually changed safety manager", async () => {
    mockUnitsPage([vacantUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(vacantUnit);
    const wrapper = mountUnitsView();
    await flushPromises();

    await openCreateContractDialog(wrapper);
    await findInputByLabel(wrapper, "乙方联系人").setValue("乙方联系人甲");
    await flushPromises();
    await findInputByLabel(wrapper, "乙方安全管理负责人").setValue("专职安全员");
    await findInputByLabel(wrapper, "乙方联系人").setValue("乙方联系人乙");
    await flushPromises();

    expect((findInputByLabel(wrapper, "乙方安全管理负责人").element as HTMLInputElement).value).toBe(
      "专职安全员",
    );
  });

  it("preserves saved safety managers when editing an existing contract", async () => {
    const contractWithDedicatedManagers = {
      ...oldContract,
      lessorSafetyManager: "甲方专职安全员",
      tenantSafetyManager: "乙方专职安全员",
    } as Contract;
    const unitWithDedicatedManagers = {
      ...unit,
      activeContract: {
        ...activeContract,
        lessorSafetyManager: "甲方专职安全员",
        tenantSafetyManager: "乙方专职安全员",
      },
      contracts: [contractWithDedicatedManagers],
    } satisfies UnitSummary;
    mockUnitsPage([unitWithDedicatedManagers]);
    vi.mocked(unitsApi.detail).mockResolvedValue(unitWithDedicatedManagers);
    const wrapper = mountUnitsView();
    await flushPromises();

    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "编辑").trigger("click");
    await flushPromises();

    expect((findInputByLabel(wrapper, "甲方安全管理负责人").element as HTMLInputElement).value).toBe(
      "甲方专职安全员",
    );
    expect((findInputByLabel(wrapper, "乙方安全管理负责人").element as HTMLInputElement).value).toBe(
      "乙方专职安全员",
    );
  });

  it("falls back safely when a legacy contract summary omits document fields", async () => {
    const legacyContract = {
      ...oldContract,
      lessorSafetyManager: undefined,
      tenantSafetyManager: undefined,
      signedDate: undefined,
      earlyTerminationPenaltyAmount: undefined,
    } as unknown as Contract;
    const legacyUnit = {
      ...unit,
      contracts: [legacyContract],
    } satisfies UnitSummary;
    mockUnitsPage([legacyUnit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(legacyUnit);
    const wrapper = mountUnitsView();
    await flushPromises();

    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "编辑").trigger("click");
    await flushPromises();
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(contractsApi.update).toHaveBeenCalledWith(
      "contract-old",
      expect.objectContaining({
        lessorSafetyManager: "吴孝斌",
        tenantSafetyManager: "曹忠",
        signedDate: "2026-07-01",
        earlyTerminationPenaltyAmount: 4166.67,
      }),
    );
    expect(ElMessage.error).not.toHaveBeenCalledWith(
      expect.stringContaining("trim"),
    );
  });

  it("submits an edited deposit separately from the termination penalty", async () => {
    const contractWithZeroDeposit = {
      ...oldContract,
      depositAmount: 0,
      earlyTerminationPenaltyAmount: 5000,
    } as Contract;
    const unitWithZeroDeposit = {
      ...unit,
      activeContract: {
        ...activeContract,
        depositAmount: 0,
        earlyTerminationPenaltyAmount: 5000,
      },
      contracts: [contractWithZeroDeposit],
    } satisfies UnitSummary;
    mockUnitsPage([unitWithZeroDeposit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(unitWithZeroDeposit);
    const wrapper = mountUnitsView();
    await flushPromises();

    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "编辑").trigger("click");
    await flushPromises();
    await findInputByLabel(wrapper, "押金").setValue("5000");
    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(contractsApi.update).toHaveBeenCalledWith(
      "contract-old",
      expect.objectContaining({
        depositAmount: 5000,
        earlyTerminationPenaltyAmount: 5000,
      }),
    );
  });

  it("blocks saving when required party and safety agreement fields are empty", async () => {
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
      "甲方安全管理负责人",
      "乙方安全管理负责人",
    ]) {
      await findInputByLabel(wrapper, label).setValue("");
    }

    await findButton(wrapper, "保存").trigger("click");
    await flushPromises();

    expect(contractsApi.create).not.toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalledWith("甲方名称不能为空");
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
    await findInputByLabel(wrapper, "初始合同乙方名称").setValue("测试租户有限公司");
    await findInputByLabel(wrapper, "初始合同乙方联系人").setValue("张三");
    await findInputByLabel(wrapper, "初始合同乙方安全管理负责人").setValue("张三");
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
        lessorSafetyManager: "吴孝斌",
        tenantName: "测试租户有限公司",
        tenantSafetyManager: "张三",
        signedDate: "2026-09-01",
        startDate: "2026-09-01",
        endDate: "2027-08-31",
        annualRent: 50000,
        earlyTerminationPenaltyAmount: 4166.67,
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
    expect(ElMessage.success).toHaveBeenCalledWith("合同已新增");
    expect(ElMessage.success).toHaveBeenCalledWith("合同已开始下载");

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
