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
  tenantName: "曹忠",
  contactName: "曹忠",
  tenantPhone: "15951506512",
  licenseCode: "",
  startDate: "2026-07-01",
  endDate: "2027-06-30",
  annualRent: 50000,
  paidAmount: 0,
  outstandingAmount: 0,
  status: "active",
} satisfies UnitSummary["activeContract"];

const oldContract = {
  id: "contract-old",
  unitId: "unit-1",
  tenantName: "曹忠",
  contactName: "曹忠",
  tenantPhone: "15951506512",
  licenseCode: "",
  startDate: "2026-07-01",
  endDate: "2027-06-30",
  annualRent: 50000,
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
  tenantName: "曹忠",
  contactName: "曹忠",
  tenantPhone: "15951506512",
  licenseCode: "",
  startDate: "2027-07-01",
  endDate: "2028-06-30",
  annualRent: 50000,
  paidAmount: 0,
  outstandingAmount: 0,
  status: "active",
  businessLicenseFileId: null,
  businessLicenseFile: null,
  attachmentFiles: [],
} satisfies Contract;

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

async function fillAnnualRent(wrapper: ReturnType<typeof mountUnitsView>, value: string) {
  const annualRentInput = wrapper
    .findAll('input[type="number"]')
    .find((input) => input.element instanceof HTMLInputElement && input.element.value === "0");
  expect(annualRentInput).toBeTruthy();
  await annualRentInput!.setValue(value);
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
        originalName: "自动生成厂房租赁合同_5_曹忠_2027-07-01_2028-06-30.pdf",
        mimeType: "application/pdf",
      },
      filename: "自动生成厂房租赁合同_5_曹忠_2027-07-01_2028-06-30.pdf",
      mimeType: "application/pdf",
    });
  });

  it("downloads a newly saved contract without pre-generating the document twice", async () => {
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const wrapper = mountUnitsView();
    await flushPromises();

    await openCreateContractDialog(wrapper);
    await fillAnnualRent(wrapper, "50000");

    await findButton(wrapper, "保存并下载合同").trigger("click");
    await flushPromises();

    expect(contractsApi.create).toHaveBeenCalledTimes(1);
    expect(contractsApi.generateDocument).not.toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalledTimes(1);
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
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const wrapper = mountUnitsView();
    await flushPromises();

    await findButton(wrapper, "管理").trigger("click");
    await flushPromises();
    await findButton(wrapper, "下载合同").trigger("click");
    await flushPromises();

    expect(contractsApi.generateDocument).not.toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(ElMessage.success).toHaveBeenCalledWith("合同已开始下载");

    anchorClick.mockRestore();
  });
});
