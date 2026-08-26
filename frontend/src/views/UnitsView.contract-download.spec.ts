import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, provide, inject } from "vue";
import { ElMessage } from "element-plus";
import UnitsView from "./UnitsView.vue";
import { contractsApi, unitsApi } from "../api";
import type { Contract, UnitSummary } from "../types/models";

vi.mock("../api", () => ({
  contractsApi: {
    create: vi.fn(),
    update: vi.fn(),
    generateDocument: vi.fn(),
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
  receivableAmount: 50000,
  paidAmount: 0,
  outstandingAmount: 0,
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
  receivableAmount: 50000,
  paidAmount: 0,
  outstandingAmount: 0,
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
  receivableAmount: 0,
  paidAmount: 0,
  outstandingAmount: 0,
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
                table.getRows().map((row) =>
                  slots.default
                    ? slots.default({ row })
                    : h("span", String((row as Record<string, unknown>)[props.prop as string] ?? "")),
                ),
              );
          },
        }),
        "el-tag": passthroughStub("span"),
        "el-select": passthroughStub("select"),
        "el-option": defineComponent({
          setup() {
            return () => null;
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

describe("UnitsView contract download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(unitsApi.list).mockResolvedValue([unit]);
    vi.mocked(unitsApi.detail).mockResolvedValue(unit);
    vi.mocked(contractsApi.create).mockResolvedValue(savedContract);
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

  it("shows the accrued receivable instead of one annual rent in contract history", async () => {
    const accruedContract = Object.assign({}, oldContract, {
      receivableAmount: 100000,
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

    expect(wrapper.text()).toContain("¥100,000.00");
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
