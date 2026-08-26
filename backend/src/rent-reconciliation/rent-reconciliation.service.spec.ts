import { NotFoundException } from "@nestjs/common";
import { join } from "path";
import { RentReconciliationService } from "./rent-reconciliation.service";

type PaymentFixtureOptions = {
  id: string;
  contractId: string;
  tenantName?: string;
  amount: number;
  paymentDate: string;
  deletedAt?: Date | null;
};

function paymentFixture(options: PaymentFixtureOptions) {
  return {
    id: options.id,
    contractId: options.contractId,
    paymentDate: options.paymentDate,
    amount: options.amount,
    method: "转账",
    note: `${options.id} 备注`,
    deletedAt: options.deletedAt ?? null,
    contract: {
      id: options.contractId,
      tenantName: options.tenantName ?? "大理石",
      deletedAt: null,
    },
    attachmentFiles: [
      {
        id: `${options.id}-file`,
        originalName: `${options.id}.png`,
        mimeType: "image/png",
        size: 123,
        category: "rent-payment",
      },
    ],
  };
}

function scheduleFixture(options: {
  id: string;
  contractId?: string;
  tenantName?: string;
  sequence: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  receivableAmount?: number;
  allocations?: Array<{
    payment: ReturnType<typeof paymentFixture>;
    allocatedAmount: number;
    deletedAt?: Date | null;
  }>;
  contractDeletedAt?: Date | null;
}) {
  const contractId = options.contractId ?? "contract-1";
  return {
    id: options.id,
    contractId,
    sequence: options.sequence,
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    dueDate: options.dueDate,
    receivableAmount: options.receivableAmount ?? 90000,
    allocations: (options.allocations ?? []).map((allocation, index) => ({
      id: `${options.id}-allocation-${index}`,
      rentPaymentId: allocation.payment.id,
      rentReceivableScheduleId: options.id,
      allocatedAmount: allocation.allocatedAmount,
      deletedAt: allocation.deletedAt ?? null,
      payment: allocation.payment,
    })),
    contract: {
      id: contractId,
      tenantName: options.tenantName ?? "大理石",
      deletedAt: options.contractDeletedAt ?? null,
      unit: {
        id: `${contractId}-unit`,
        code: contractId,
        location: `${contractId} 厂房`,
      },
    },
  };
}

function receiptFixture(
  sourceId: string,
  status: "active" | "void" = "active",
) {
  return {
    id: `${sourceId}-${status}-receipt`,
    receiptNo: `RC-${sourceId}-${status}`,
    sourceType: "rent-payment",
    sourceId,
    status,
    pdfFile: {
      id: `${sourceId}-${status}-pdf`,
      originalName: `${sourceId}.pdf`,
      mimeType: "application/pdf",
      size: 456,
      category: "receipt",
    },
  };
}

function createService(
  options: {
    schedules?: unknown[];
    payments?: unknown[];
    receipts?: unknown[];
  } = {},
) {
  const schedulesRepository = {
    find: jest.fn().mockResolvedValue(options.schedules ?? []),
  };
  const paymentsRepository = {
    find: jest.fn().mockResolvedValue(options.payments ?? []),
  };
  const receiptsRepository = {
    find: jest.fn().mockResolvedValue(options.receipts ?? []),
  };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue({
      root: "/tmp/rent-test-storage",
      pdfFontPath: join(
        __dirname,
        "..",
        "..",
        "assets",
        "fonts",
        "NotoSansCJKsc-Regular.otf",
      ),
    }),
  };
  const ServiceWithMocks = RentReconciliationService as unknown as new (
    schedulesRepository: unknown,
    paymentsRepository: unknown,
    receiptsRepository: unknown,
    configService: unknown,
  ) => RentReconciliationService;

  return {
    service: new ServiceWithMocks(
      schedulesRepository,
      paymentsRepository,
      receiptsRepository,
      configService,
    ),
    schedulesRepository,
    paymentsRepository,
    receiptsRepository,
  };
}

describe("RentReconciliationService", () => {
  it("uses saved schedules and preserves one payment's allocated amount across periods", async () => {
    const payment = paymentFixture({
      id: "payment-1",
      contractId: "contract-1",
      amount: 100000,
      paymentDate: "2026-01-15",
    });
    const { service, schedulesRepository } = createService({
      schedules: [
        scheduleFixture({
          id: "schedule-1",
          sequence: 1,
          periodStart: "2025-09-01",
          periodEnd: "2026-08-31",
          dueDate: "2025-09-01",
          allocations: [{ payment, allocatedAmount: 90000 }],
        }),
        scheduleFixture({
          id: "schedule-2",
          sequence: 2,
          periodStart: "2026-09-01",
          periodEnd: "2027-08-31",
          dueDate: "2026-09-01",
          allocations: [{ payment, allocatedAmount: 10000 }],
        }),
      ],
      payments: [payment],
      receipts: [
        receiptFixture("payment-1"),
        receiptFixture("payment-1", "void"),
      ],
    });

    const detail = await service.detail({ tenantName: " 大理石 " });

    expect(schedulesRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: expect.objectContaining({
          allocations: expect.objectContaining({ payment: expect.any(Object) }),
          contract: expect.objectContaining({ unit: true }),
        }),
      }),
    );
    expect(detail).toMatchObject({
      tenantName: "大理石",
      contractCount: 2,
      dueReceivableAmount: 90000,
      duePaidAmount: 90000,
      outstandingAmount: 0,
      prepaidAmount: 10000,
      unallocatedAmount: 0,
      lastPaymentDate: "2026-01-15",
      status: "prepaid",
    });
    expect(detail).not.toHaveProperty("receivableAmount");
    expect(detail).not.toHaveProperty("paidAmount");
    expect(detail).not.toHaveProperty("creditAmount");
    expect(detail.periods).toEqual([
      expect.objectContaining({
        scheduleId: "schedule-2",
        sequence: 2,
        dueDate: "2026-09-01",
        paidAmount: 10000,
        outstandingAmount: 0,
        prepaidAmount: 10000,
        status: "partially-prepaid",
        payments: [
          expect.objectContaining({
            id: "payment-1",
            amount: 10000,
            note: "payment-1 备注",
            method: "转账",
            activeReceipt: expect.objectContaining({
              receiptNo: "RC-payment-1-active",
            }),
          }),
        ],
      }),
      expect.objectContaining({
        scheduleId: "schedule-1",
        sequence: 1,
        paidAmount: 90000,
        prepaidAmount: 0,
        status: "settled",
        payments: [expect.objectContaining({ id: "payment-1", amount: 90000 })],
      }),
    ]);
    expect(
      detail.periods
        .flatMap((period) => period.payments)
        .reduce((sum, item) => sum + item.amount, 0),
    ).toBe(100000);
  });

  it("keeps excess payment as tenant-level unallocated credit instead of a period payment", async () => {
    const payment = paymentFixture({
      id: "payment-excess",
      contractId: "contract-1",
      amount: 100000,
      paymentDate: "2026-02-01",
    });
    const { service } = createService({
      schedules: [
        scheduleFixture({
          id: "schedule-due",
          sequence: 1,
          periodStart: "2025-09-01",
          periodEnd: "2026-08-31",
          dueDate: "2025-09-01",
          allocations: [{ payment, allocatedAmount: 90000 }],
        }),
      ],
      payments: [payment],
    });

    const detail = await service.detail({ tenantName: "大理石" });

    expect(detail).toMatchObject({
      unallocatedAmount: 10000,
      status: "credit",
    });
    expect(detail.periods[0]).toMatchObject({ paidAmount: 90000 });
    expect(detail.periods[0].payments).toEqual([
      expect.objectContaining({ amount: 90000 }),
    ]);
  });

  it("ignores soft-deleted contracts, payments, and allocations", async () => {
    const activePayment = paymentFixture({
      id: "payment-active",
      contractId: "contract-active",
      amount: 60000,
      paymentDate: "2026-01-01",
    });
    const deletedPayment = paymentFixture({
      id: "payment-deleted",
      contractId: "contract-active",
      amount: 20000,
      paymentDate: "2026-02-01",
      deletedAt: new Date("2026-03-01T00:00:00Z"),
    });
    const { service, paymentsRepository } = createService({
      schedules: [
        scheduleFixture({
          id: "active",
          contractId: "contract-active",
          sequence: 1,
          periodStart: "2025-01-01",
          periodEnd: "2025-12-31",
          dueDate: "2025-01-01",
          tenantName: "有效租户",
          allocations: [
            { payment: activePayment, allocatedAmount: 60000 },
            { payment: deletedPayment, allocatedAmount: 20000 },
            {
              payment: activePayment,
              allocatedAmount: 10000,
              deletedAt: new Date("2026-03-01T00:00:00Z"),
            },
          ],
        }),
        scheduleFixture({
          id: "deleted-contract",
          contractId: "contract-deleted",
          sequence: 1,
          periodStart: "2025-01-01",
          periodEnd: "2025-12-31",
          dueDate: "2025-01-01",
          tenantName: "已删除租户",
          contractDeletedAt: new Date("2026-03-01T00:00:00Z"),
        }),
      ],
      payments: [activePayment, deletedPayment],
    });

    const result = await service.list({});

    expect(paymentsRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ contract: expect.any(Object) }),
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        tenantName: "有效租户",
        duePaidAmount: 60000,
        outstandingAmount: 30000,
      }),
    ]);
  });

  it.each([undefined, null])(
    "ignores an allocation whose payment relation is %s",
    async (missingPayment) => {
      const payment = paymentFixture({
        id: "payment-missing-relation",
        contractId: "contract-1",
        amount: 90000,
        paymentDate: "2026-01-01",
      });
      const schedule = scheduleFixture({
        id: "schedule-missing-relation",
        sequence: 1,
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        dueDate: "2025-01-01",
        allocations: [{ payment, allocatedAmount: 90000 }],
      });
      schedule.allocations[0].payment = missingPayment as never;
      const { service } = createService({
        schedules: [schedule],
        payments: [payment],
      });

      const detail = await service.detail({ tenantName: "大理石" });

      expect(detail).toMatchObject({
        duePaidAmount: 0,
        outstandingAmount: 90000,
        unallocatedAmount: 90000,
      });
      expect(detail.periods[0]).toMatchObject({ paidAmount: 0 });
      expect(detail.periods[0].payments).toEqual([]);
    },
  );

  it("filters by periodStart year and derived status while retaining every saved-plan year", async () => {
    const creditPayment = paymentFixture({
      id: "payment-credit",
      contractId: "contract-credit",
      tenantName: "信用租户",
      amount: 100000,
      paymentDate: "2025-02-01",
    });
    const prepaidPayment = paymentFixture({
      id: "payment-prepaid",
      contractId: "contract-prepaid",
      tenantName: "预付租户",
      amount: 90000,
      paymentDate: "2026-02-01",
    });
    const schedules = [
      scheduleFixture({
        id: "schedule-credit",
        contractId: "contract-credit",
        tenantName: "信用租户",
        sequence: 1,
        periodStart: "2025-12-01",
        periodEnd: "2026-11-30",
        dueDate: "2025-12-01",
        allocations: [{ payment: creditPayment, allocatedAmount: 90000 }],
      }),
      scheduleFixture({
        id: "schedule-prepaid",
        contractId: "contract-prepaid",
        tenantName: "预付租户",
        sequence: 2,
        periodStart: "2027-01-01",
        periodEnd: "2027-12-31",
        dueDate: "2027-01-01",
        allocations: [{ payment: prepaidPayment, allocatedAmount: 90000 }],
      }),
      scheduleFixture({
        id: "schedule-outstanding",
        contractId: "contract-outstanding",
        tenantName: "欠款租户",
        sequence: 1,
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        dueDate: "2025-01-01",
      }),
      scheduleFixture({
        id: "schedule-settled",
        contractId: "contract-settled",
        tenantName: "结清租户",
        sequence: 1,
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        dueDate: "2024-01-01",
        allocations: [
          {
            payment: paymentFixture({
              id: "payment-settled",
              contractId: "contract-settled",
              tenantName: "结清租户",
              amount: 90000,
              paymentDate: "2024-01-01",
            }),
            allocatedAmount: 90000,
          },
        ],
      }),
    ];
    const { service } = createService({
      schedules,
      payments: [
        creditPayment,
        prepaidPayment,
        schedules[3].allocations[0].payment,
      ],
    });

    const prepaid = await service.list({
      year: 2027,
      status: "prepaid" as never,
    });
    const credit = await service.list({
      year: 2025,
      status: "credit" as never,
    });
    const outstanding = await service.list({
      year: 2025,
      status: "outstanding" as never,
    });
    const settled = await service.list({
      year: 2024,
      status: "settled" as never,
    });

    expect(prepaid.availableYears).toEqual([2027, 2025, 2024]);
    expect(prepaid.items).toEqual([
      expect.objectContaining({ tenantName: "预付租户" }),
    ]);
    expect(credit.items).toEqual([
      expect.objectContaining({ tenantName: "信用租户" }),
    ]);
    expect(outstanding.items).toEqual([
      expect.objectContaining({ tenantName: "欠款租户" }),
    ]);
    expect(settled.items).toEqual([
      expect.objectContaining({ tenantName: "结清租户" }),
    ]);
  });

  it("gives outstanding priority over credit and prepaid", async () => {
    const payment = paymentFixture({
      id: "payment-mixed",
      contractId: "contract-mixed",
      tenantName: "混合租户",
      amount: 60000,
      paymentDate: "2026-01-01",
    });
    const { service } = createService({
      schedules: [
        scheduleFixture({
          id: "mixed-due",
          contractId: "contract-mixed",
          tenantName: "混合租户",
          sequence: 1,
          periodStart: "2025-01-01",
          periodEnd: "2025-12-31",
          dueDate: "2025-01-01",
          allocations: [{ payment, allocatedAmount: 30000 }],
        }),
        scheduleFixture({
          id: "mixed-future",
          contractId: "contract-mixed",
          tenantName: "混合租户",
          sequence: 2,
          periodStart: "2027-01-01",
          periodEnd: "2027-12-31",
          dueDate: "2027-01-01",
          allocations: [{ payment, allocatedAmount: 10000 }],
        }),
      ],
      payments: [payment],
    });

    const detail = await service.detail({ tenantName: "混合租户" });

    expect(detail).toMatchObject({
      outstandingAmount: 60000,
      prepaidAmount: 10000,
      unallocatedAmount: 20000,
      status: "outstanding",
    });
  });

  it("throws a clear error when no saved schedule matches the tenant and year", async () => {
    const { service } = createService({
      schedules: [
        scheduleFixture({
          id: "schedule-1",
          sequence: 1,
          periodStart: "2025-01-01",
          periodEnd: "2025-12-31",
          dueDate: "2025-01-01",
        }),
      ],
    });

    await expect(
      service.detail({ tenantName: "不存在", year: 2025 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.detail({ tenantName: "大理石", year: 2026 }),
    ).rejects.toThrow("未找到符合条件的房租对账记录");
  });

  it("generates a PDF with a sanitized tenant filename", async () => {
    const { service } = createService({
      schedules: [
        scheduleFixture({
          id: "schedule-1",
          tenantName: "大理石/仓储",
          sequence: 1,
          periodStart: "2025-09-01",
          periodEnd: "2026-08-31",
          dueDate: "2025-09-01",
        }),
      ],
    });

    const generated = await service.generatePdf({
      tenantName: "大理石/仓储",
      year: 2025,
    });

    expect(generated.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(generated.filename).toMatch(
      /^房租对账单_大理石_仓储_\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(generated.mimeType).toBe("application/pdf");
  });
});
