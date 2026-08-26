import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, inject, provide } from "vue";
import { ElMessage } from "element-plus";
import { rentReconciliationApi } from "../api";
import type { RentReconciliationListResponse, TenantReconciliationDetail } from "../types";
import RentReconciliationView from "./RentReconciliationView.vue";

vi.mock("../api", () => ({
  rentReconciliationApi: {
    list: vi.fn(),
    detail: vi.fn(),
    downloadPdf: vi.fn(),
  },
}));

vi.mock("element-plus", () => ({
  ElMessage: {
    error: vi.fn(),
  },
}));

vi.mock("../../../api/client", () => ({
  apiFileUrl: (id: string) => `/api/files/${id}/download`,
}));

vi.mock("../../../components/AppShell.vue", () => ({
  default: defineComponent({
    setup(_, { slots }) {
      return () => h("div", [slots["top-actions"]?.(), slots.default?.()]);
    },
  }),
}));

vi.mock("../../../components/PaymentVoucherPreviewDialog.vue", () => ({
  default: defineComponent({
    props: ["modelValue", "files"],
    setup(props) {
      return () =>
        props.modelValue
          ? h("div", { class: "voucher-preview-stub" }, `${props.files?.length ?? 0} 张凭证`)
          : null;
    },
  }),
}));

const listResponse = {
  availableYears: [2026, 2025],
  items: [
    {
      tenantName: "大理石",
      contractCount: 2,
      dueReceivableAmount: 100000,
      duePaidAmount: 60000,
      outstandingAmount: 40000,
      prepaidAmount: 25000,
      unallocatedAmount: 3000,
      lastPaymentDate: "2026-01-15",
      status: "outstanding" as const,
    },
  ],
} satisfies RentReconciliationListResponse;

const detailResponse = {
  ...listResponse.items[0],
  periods: [
    {
      scheduleId: "schedule-1",
      contractId: "contract-1",
      sequence: 1,
      unit: {
        id: "unit-1",
        code: "5",
        location: "北门仓库",
      },
      startDate: "2025-09-01",
      endDate: "2026-08-31",
      dueDate: "2025-09-01",
      receivableAmount: 100000,
      paidAmount: 60000,
      outstandingAmount: 40000,
      prepaidAmount: 0,
      status: "overdue" as const,
      payments: [
        {
          id: "payment-1",
          contractId: "contract-1",
          paymentDate: "2026-01-15",
          amount: 60000,
          method: "转账",
          note: "跨期付款",
          attachmentFiles: [
            {
              id: "voucher-1",
              originalName: "voucher.png",
              mimeType: "image/png",
              size: 100,
              category: "payment-voucher",
            },
          ],
          activeReceipt: {
            id: "receipt-1",
            receiptNo: "RC20260115-001",
            pdfFile: {
              id: "receipt-pdf-1",
              originalName: "receipt.pdf",
              mimeType: "application/pdf",
              size: 100,
              category: "receipt",
            },
          },
        },
      ],
    },
    {
      scheduleId: "schedule-2",
      contractId: "contract-1",
      sequence: 2,
      unit: {
        id: "unit-1",
        code: "5",
        location: "北门仓库",
      },
      startDate: "2026-09-01",
      endDate: "2027-08-31",
      dueDate: "2026-09-01",
      receivableAmount: 50000,
      paidAmount: 25000,
      outstandingAmount: 0,
      prepaidAmount: 25000,
      status: "partially-prepaid" as const,
      payments: [
        {
          id: "payment-1",
          contractId: "contract-1",
          paymentDate: "2026-01-15",
          amount: 25000,
          method: "转账",
          note: "跨期付款",
          attachmentFiles: [],
          activeReceipt: null,
        },
      ],
    },
  ],
} satisfies TenantReconciliationDetail;

function passthroughStub(tag = "div") {
  return defineComponent({
    props: ["modelValue"],
    emits: ["update:modelValue", "change"],
    setup(_, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.());
    },
  });
}

function mountView() {
  const tableRowsKey = Symbol("tableRows");
  type TableRowsContext = { getRows: () => unknown[] };

  return mount(RentReconciliationView, {
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
                {
                  ...attrs,
                  disabled: props.disabled || props.loading,
                  onClick: (event: MouseEvent) => emit("click", event),
                },
                slots.default?.(),
              );
          },
        }),
        "el-input": passthroughStub("input"),
        "el-select": defineComponent({
          props: ["modelValue"],
          emits: ["update:modelValue"],
          setup(props, { attrs, emit, slots }) {
            return () =>
              h(
                "select",
                {
                  ...attrs,
                  value: props.modelValue,
                  onChange: (event: Event) =>
                    emit("update:modelValue", (event.target as HTMLSelectElement).value),
                },
                slots.default?.(),
              );
          },
        }),
        "el-option": defineComponent({
          props: ["label", "value"],
          setup(props) {
            return () => h("option", { value: props.value }, String(props.label));
          },
        }),
        "el-tag": passthroughStub("span"),
        "el-dialog": defineComponent({
          props: ["modelValue"],
          setup(props, { slots }) {
            return () => (props.modelValue ? h("div", [slots.default?.(), slots.footer?.()]) : null);
          },
        }),
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
          props: ["prop"],
          setup(props, { slots }) {
            const table = inject<TableRowsContext>(tableRowsKey, { getRows: () => [] });
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
      },
    },
  });
}

function findButton(wrapper: ReturnType<typeof mountView>, text: string) {
  const button = wrapper.findAll("button").find((item) => item.text().includes(text));
  expect(button, `expected button containing "${text}"`).toBeTruthy();
  return button!;
}

Object.defineProperty(URL, "createObjectURL", {
  configurable: true,
  writable: true,
  value: () => "",
});
Object.defineProperty(URL, "revokeObjectURL", {
  configurable: true,
  writable: true,
  value: () => undefined,
});

describe("RentReconciliationView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rentReconciliationApi.list).mockResolvedValue(listResponse);
    vi.mocked(rentReconciliationApi.detail).mockResolvedValue(detailResponse);
    vi.mocked(rentReconciliationApi.downloadPdf).mockResolvedValue({
      blob: new Blob(["pdf"], { type: "application/pdf" }),
      filename: "房租对账单_大理石_2026-08-21.pdf",
      contentType: "application/pdf",
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:reconciliation");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.spyOn(window, "print").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads tenant summaries and opens contract-period payment details", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("大理石");
    expect(wrapper.text()).toContain("40,000.00");
    expect(wrapper.text()).toContain("租赁期");
    expect(wrapper.text()).not.toContain("合同期");
    expect(wrapper.text()).not.toContain("累计应收");
    expect(wrapper.text()).not.toContain("累计实收");
    expect(wrapper.text()).toContain("预收");
    expect(wrapper.text()).toContain("未分配");
    expect(wrapper.find('select[aria-label="租赁年度"]').exists()).toBe(true);

    await findButton(wrapper, "查看对账").trigger("click");
    await flushPromises();

    expect(rentReconciliationApi.detail).toHaveBeenCalledWith({
      tenantName: "大理石",
      year: undefined,
    });
    const detailStats = wrapper.get(".reconciliation-stats");
    expect(detailStats.findAll(".stat-item")).toHaveLength(3);
    expect(detailStats.text()).not.toContain("累计应收");
    expect(detailStats.text()).not.toContain("累计实收");
    expect(detailStats.text()).toContain("当前结欠");
    expect(detailStats.text()).toContain("预收");
    expect(detailStats.text()).toContain("未分配");
    expect(wrapper.text()).toContain("2025-09-01 至 2026-08-31");
    expect(wrapper.text()).toContain("到期日 2026-09-01");
    expect(wrapper.text()).toContain("部分预收");
    expect(wrapper.text()).toContain("¥25,000.00");
    expect(wrapper.text()).toContain("转账");
    expect(wrapper.text()).toContain("RC20260115-001");
    expect(wrapper.text().match(/跨期付款/g)).toHaveLength(2);
  });

  it("keeps future partial and full prepayments out of current outstanding and leaves excess unallocated", async () => {
    const futureDetail = {
      ...detailResponse,
      outstandingAmount: 0,
      prepaidAmount: 75000,
      unallocatedAmount: 9000,
      status: "credit" as const,
      periods: [
        detailResponse.periods[1],
        {
          ...detailResponse.periods[1],
          scheduleId: "schedule-3",
          sequence: 3,
          startDate: "2027-09-01",
          endDate: "2028-08-31",
          dueDate: "2027-09-01",
          paidAmount: 50000,
          prepaidAmount: 50000,
          status: "prepaid" as const,
          payments: [],
        },
      ],
    } satisfies TenantReconciliationDetail;
    vi.mocked(rentReconciliationApi.detail).mockResolvedValue(futureDetail);
    const wrapper = mountView();
    await flushPromises();

    await findButton(wrapper, "查看对账").trigger("click");
    await flushPromises();

    const currentOutstanding = wrapper.get('[data-test="current-outstanding"]');
    expect(currentOutstanding.text()).toContain("¥0.00");
    expect(currentOutstanding.classes()).not.toContain("amount-overdue");
    expect(wrapper.text()).toContain("部分预收");
    expect(wrapper.text()).toContain("已预收");
    expect(wrapper.text()).toContain("¥9,000.00");
    expect(wrapper.text()).not.toContain("¥59,000.00");
  });

  it("sends the prepaid ledger filter", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('select[aria-label="对账状态"]').setValue("prepaid");
    await findButton(wrapper, "查询").trigger("click");
    await flushPromises();

    expect(rentReconciliationApi.list).toHaveBeenLastCalledWith({
      keyword: undefined,
      year: undefined,
      status: "prepaid",
    });
  });

  it("marks both the outstanding label and amount red for any non-zero value", async () => {
    vi.mocked(rentReconciliationApi.detail).mockResolvedValue({
      ...detailResponse,
      outstandingAmount: -1,
      periods: [{ ...detailResponse.periods[0], outstandingAmount: -1 }],
    });
    const wrapper = mountView();
    await flushPromises();
    await findButton(wrapper, "查看对账").trigger("click");
    await flushPromises();

    const currentOutstanding = wrapper.get('[data-test="current-outstanding"]');
    expect(currentOutstanding.classes()).toContain("amount-overdue");
    expect(currentOutstanding.find("small").classes()).toContain("amount-overdue");
    const periodOutstanding = wrapper.get('[data-test="period-outstanding"]');
    expect(periodOutstanding.find("dt").classes()).toContain("amount-overdue");
    expect(periodOutstanding.find("dd").classes()).toContain("amount-overdue");
  });

  it("ignores a stale detail success when switching tenants", async () => {
    let resolveA!: (value: TenantReconciliationDetail) => void;
    const requestA = new Promise<TenantReconciliationDetail>((resolve) => {
      resolveA = resolve;
    });
    const tenantB = {
      ...detailResponse,
      tenantName: "五金仓储",
      periods: detailResponse.periods.map((period) => ({
        ...period,
        unit: { ...period.unit, code: "B9", location: "西区仓库" },
      })),
    };
    vi.mocked(rentReconciliationApi.detail)
      .mockReturnValueOnce(requestA)
      .mockResolvedValueOnce(tenantB);
    vi.mocked(rentReconciliationApi.list).mockResolvedValue({
      ...listResponse,
      items: [...listResponse.items, { ...listResponse.items[0], tenantName: "五金仓储" }],
    });
    const wrapper = mountView();
    await flushPromises();

    const detailButtons = wrapper.findAll("button").filter((button) => button.text().includes("查看对账"));
    await detailButtons[0].trigger("click");
    await (wrapper.vm as unknown as { openDetail: (tenantName: string) => Promise<void> }).openDetail("五金仓储");
    await flushPromises();
    resolveA(detailResponse);
    await flushPromises();

    expect(wrapper.text()).toContain("五金仓储");
    expect(wrapper.text()).toContain("B9 / 西区仓库");
    expect(wrapper.text()).not.toContain("5 / 北门仓库");
    expect(wrapper.text()).not.toContain("正在加载对账明细");
  });

  it("ignores stale detail errors and their finally state when switching tenants", async () => {
    let rejectA!: (reason?: unknown) => void;
    const requestA = new Promise<TenantReconciliationDetail>((_, reject) => {
      rejectA = reject;
    });
    const pendingB = new Promise<TenantReconciliationDetail>(() => undefined);
    vi.mocked(rentReconciliationApi.detail)
      .mockReturnValueOnce(requestA)
      .mockReturnValueOnce(pendingB);
    const wrapper = mountView();
    await flushPromises();

    await findButton(wrapper, "查看对账").trigger("click");
    void (wrapper.vm as unknown as { openDetail: (tenantName: string) => Promise<void> }).openDetail("五金仓储");
    rejectA(new Error("迟到错误"));
    await flushPromises();

    expect(wrapper.text()).toContain("正在加载对账明细");
    expect(ElMessage.error).not.toHaveBeenCalledWith("迟到错误");
  });

  it("ignores stale list success without ending the latest loading state", async () => {
    let resolveOld!: (value: RentReconciliationListResponse) => void;
    const oldRequest = new Promise<RentReconciliationListResponse>((resolve) => {
      resolveOld = resolve;
    });
    const latestRequest = new Promise<RentReconciliationListResponse>(() => undefined);
    vi.mocked(rentReconciliationApi.list)
      .mockReturnValueOnce(oldRequest)
      .mockReturnValueOnce(latestRequest);
    const wrapper = mountView();
    void (wrapper.vm as unknown as { loadList: () => Promise<void> }).loadList();
    resolveOld(listResponse);
    await flushPromises();

    expect(findButton(wrapper, "刷新").attributes("disabled")).toBeDefined();
    expect(wrapper.text()).not.toContain("大理石");
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it("ignores stale list errors and their finally state", async () => {
    let rejectOld!: (reason?: unknown) => void;
    const oldRequest = new Promise<RentReconciliationListResponse>((_, reject) => {
      rejectOld = reject;
    });
    const latestRequest = new Promise<RentReconciliationListResponse>(() => undefined);
    vi.mocked(rentReconciliationApi.list)
      .mockReturnValueOnce(oldRequest)
      .mockReturnValueOnce(latestRequest);
    const wrapper = mountView();
    void (wrapper.vm as unknown as { loadList: () => Promise<void> }).loadList();
    rejectOld(new Error("迟到错误"));
    await flushPromises();

    expect(findButton(wrapper, "刷新").attributes("disabled")).toBeDefined();
    expect(ElMessage.error).not.toHaveBeenCalledWith("迟到错误");
  });

  it("selects a tenant from a stable dropdown", async () => {
    const anotherTenant = {
      ...listResponse.items[0],
      tenantName: "五金仓储",
    };
    vi.mocked(rentReconciliationApi.list)
      .mockResolvedValueOnce({
        ...listResponse,
        items: [...listResponse.items, anotherTenant],
      })
      .mockResolvedValueOnce(listResponse);

    const wrapper = mountView();
    await flushPromises();

    const tenantSelect = wrapper.find('select[aria-label="选择租户"]');
    expect(tenantSelect.exists()).toBe(true);
    expect(tenantSelect.findAll("option").map((option) => option.text())).toEqual([
      "全部租户",
      "大理石",
      "五金仓储",
    ]);

    await tenantSelect.setValue("大理石");
    await findButton(wrapper, "查询").trigger("click");
    await flushPromises();

    expect(rentReconciliationApi.list).toHaveBeenLastCalledWith({
      keyword: "大理石",
      year: undefined,
      status: undefined,
    });
    expect(tenantSelect.findAll("option").map((option) => option.text())).toEqual([
      "全部租户",
      "大理石",
      "五金仓储",
    ]);
  });

  it("opens voucher and receipt previews from a payment row", async () => {
    const wrapper = mountView();
    await flushPromises();
    await findButton(wrapper, "查看对账").trigger("click");
    await flushPromises();

    await findButton(wrapper, "1 张").trigger("click");
    expect(wrapper.find(".voucher-preview-stub").text()).toContain("1 张凭证");

    await findButton(wrapper, "查看收据").trigger("click");
    expect(wrapper.find("iframe").attributes("src")).toBe("/api/files/receipt-pdf-1/download");
  });

  it("prints the current tenant detail", async () => {
    const wrapper = mountView();
    await flushPromises();
    await findButton(wrapper, "查看对账").trigger("click");
    await flushPromises();

    await findButton(wrapper, "打印").trigger("click");

    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("guards PDF download against duplicate clicks", async () => {
    let resolveDownload!: (value: Awaited<ReturnType<typeof rentReconciliationApi.downloadPdf>>) => void;
    vi.mocked(rentReconciliationApi.downloadPdf).mockReturnValue(
      new Promise((resolve) => {
        resolveDownload = resolve;
      }),
    );
    const wrapper = mountView();
    await flushPromises();
    await findButton(wrapper, "查看对账").trigger("click");
    await flushPromises();

    const downloadButton = findButton(wrapper, "下载 PDF");
    await downloadButton.trigger("click");
    await downloadButton.trigger("click");

    expect(rentReconciliationApi.downloadPdf).toHaveBeenCalledTimes(1);
    resolveDownload({
      blob: new Blob(["pdf"], { type: "application/pdf" }),
      filename: "房租对账单_大理石_2026-08-21.pdf",
      contentType: "application/pdf",
    });
    await flushPromises();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  it("shows a clear error when the list request fails", async () => {
    vi.mocked(rentReconciliationApi.list).mockRejectedValue(new Error("网络不可用"));

    mountView();
    await flushPromises();

    expect(ElMessage.error).toHaveBeenCalledWith("网络不可用");
  });
});
