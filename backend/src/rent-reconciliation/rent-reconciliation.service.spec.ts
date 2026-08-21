import { NotFoundException } from "@nestjs/common";
import { RentReconciliationService } from "./rent-reconciliation.service";

type PaymentFixtureOptions = {
  id: string;
  contractId: string;
  amount: number;
  paymentDate: string;
  deletedAt?: Date | null;
};

type ContractFixtureOptions = {
  id: string;
  tenantName: string;
  startDate: string;
  endDate: string;
  annualRent: number;
  unitCode?: string;
  payments?: ReturnType<typeof paymentFixture>[];
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
    attachmentFiles: [
      {
        id: `${options.id}-file`,
        originalName: `${options.id}.png`,
        mimeType: "image/png",
      },
    ],
  };
}

function contractFixture(options: ContractFixtureOptions) {
  return {
    id: options.id,
    tenantName: options.tenantName,
    startDate: options.startDate,
    endDate: options.endDate,
    annualRent: options.annualRent,
    unitId: `${options.id}-unit`,
    unit: {
      id: `${options.id}-unit`,
      code: options.unitCode ?? options.id,
      location: `${options.id} 厂房`,
    },
    rentPayments: options.payments ?? [],
  };
}

function receiptFixture(sourceId: string, status: "active" | "void" = "active") {
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
    },
  };
}

function createService(contracts: unknown[], receipts: unknown[] = []) {
  const contractsRepository = {
    find: jest.fn().mockResolvedValue(contracts),
  };
  const receiptsRepository = {
    find: jest.fn().mockResolvedValue(receipts),
  };
  const ServiceWithMocks = RentReconciliationService as unknown as new (
    contractsRepository: unknown,
    receiptsRepository: unknown,
  ) => RentReconciliationService;

  return {
    service: new ServiceWithMocks(contractsRepository, receiptsRepository),
    contractsRepository,
    receiptsRepository,
  };
}

describe("RentReconciliationService", () => {
  it("aggregates a tenant across contract periods with cent-safe balances and payment evidence", async () => {
    const firstPayment = paymentFixture({
      id: "payment-1",
      contractId: "contract-1",
      paymentDate: "2025-10-01",
      amount: 75000,
    });
    const centPayment = paymentFixture({
      id: "payment-2",
      contractId: "contract-1",
      paymentDate: "2025-11-01",
      amount: 0.02,
    });
    const deletedPayment = paymentFixture({
      id: "payment-deleted",
      contractId: "contract-1",
      paymentDate: "2025-12-01",
      amount: 999,
      deletedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const secondPayment = paymentFixture({
      id: "payment-3",
      contractId: "contract-2",
      paymentDate: "2026-10-01",
      amount: 100000,
    });
    const { service } = createService(
      [
        contractFixture({
          id: "contract-1",
          tenantName: " 大理石 ",
          startDate: "2025-09-01",
          endDate: "2026-08-31",
          annualRent: 100000.01,
          payments: [firstPayment, centPayment, deletedPayment],
        }),
        contractFixture({
          id: "contract-2",
          tenantName: "大理石",
          startDate: "2026-09-01",
          endDate: "2027-08-31",
          annualRent: 100000,
          payments: [secondPayment],
        }),
      ],
      [receiptFixture("payment-1"), receiptFixture("payment-1", "void")],
    );

    const result = await service.detail({ tenantName: " 大理石 ", year: 2026 });

    expect(result).toEqual(
      expect.objectContaining({
        tenantName: "大理石",
        contractCount: 2,
        receivableAmount: 200000.01,
        paidAmount: 175000.02,
        outstandingAmount: 24999.99,
        creditAmount: 0,
        status: "outstanding",
        lastPaymentDate: "2026-10-01",
      }),
    );
    expect(result.periods).toHaveLength(2);
    expect(result.periods[0]).toEqual(
      expect.objectContaining({
        contractId: "contract-2",
        receivableAmount: 100000,
        paidAmount: 100000,
        outstandingAmount: 0,
        creditAmount: 0,
        status: "settled",
      }),
    );
    expect(result.periods[1].payments).toHaveLength(2);
    expect(result.periods[1].payments[0]).toEqual(
      expect.objectContaining({
        id: "payment-2",
        contractId: "contract-1",
        amount: 0.02,
        activeReceipt: null,
      }),
    );
    expect(result.periods[1].payments[1]).toEqual(
      expect.objectContaining({
        id: "payment-1",
        activeReceipt: expect.objectContaining({
          receiptNo: "RC-payment-1-active",
        }),
      }),
    );
  });

  it("filters tenant summaries by year, keyword, and credit status while returning all available years", async () => {
    const { service } = createService([
      contractFixture({
        id: "contract-old",
        tenantName: "大理石",
        startDate: "2024-09-01",
        endDate: "2025-08-31",
        annualRent: 100000,
        payments: [
          paymentFixture({
            id: "payment-old",
            contractId: "contract-old",
            paymentDate: "2024-09-01",
            amount: 100000,
          }),
        ],
      }),
      contractFixture({
        id: "contract-current",
        tenantName: "大理石",
        startDate: "2025-09-01",
        endDate: "2026-08-31",
        annualRent: 100000,
        payments: [
          paymentFixture({
            id: "payment-current",
            contractId: "contract-current",
            paymentDate: "2026-01-01",
            amount: 105000,
          }),
        ],
      }),
      contractFixture({
        id: "contract-other",
        tenantName: "木制品",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        annualRent: 80000,
      }),
    ]);

    const result = await service.list({
      keyword: " 大理 ",
      year: 2026,
      status: "credit" as never,
    });

    expect(result.availableYears).toEqual([2026, 2025, 2024]);
    expect(result.items).toEqual([
      expect.objectContaining({
        tenantName: "大理石",
        contractCount: 1,
        receivableAmount: 100000,
        paidAmount: 105000,
        outstandingAmount: 0,
        creditAmount: 5000,
        status: "credit",
      }),
    ]);
  });

  it("groups trimmed exact tenant names but keeps different names separate", async () => {
    const { service } = createService([
      contractFixture({
        id: "contract-a",
        tenantName: "大理石",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        annualRent: 100000,
      }),
      contractFixture({
        id: "contract-b",
        tenantName: " 大理石 ",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        annualRent: 100000,
      }),
      contractFixture({
        id: "contract-c",
        tenantName: "大理石厂",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        annualRent: 100000,
      }),
    ]);

    const result = await service.list({});

    expect(result.items).toEqual([
      expect.objectContaining({ tenantName: "大理石", contractCount: 2 }),
      expect.objectContaining({ tenantName: "大理石厂", contractCount: 1 }),
    ]);
  });

  it("throws a clear error when the tenant has no contracts in the selected range", async () => {
    const { service } = createService([
      contractFixture({
        id: "contract-1",
        tenantName: "大理石",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        annualRent: 100000,
      }),
    ]);

    await expect(service.detail({ tenantName: "不存在", year: 2025 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.detail({ tenantName: "大理石", year: 2026 })).rejects.toThrow("未找到符合条件的房租对账记录");
  });
});
