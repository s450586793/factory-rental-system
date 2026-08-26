import { BadRequestException, NotFoundException } from "@nestjs/common";
import { BillingFrequency } from "../contracts/contract.enums";
import { Contract } from "../contracts/contract.entity";
import { RentReceivableStatus } from "./rent-receivables.dto";
import { RentReceivablesService } from "./rent-receivables.service";

function schedule(overrides: Record<string, unknown> = {}) {
  return {
    id: "schedule-1",
    contractId: "contract-1",
    sequence: 1,
    periodStart: "2026-09-01",
    periodEnd: "2027-08-31",
    dueDate: "2026-09-01",
    receivableAmount: 90000,
    allocations: [],
    contract: {
      id: "contract-1",
      unitId: "unit-1",
      tenantName: "测试租户",
      deletedAt: null,
    },
    ...overrides,
  };
}

function contract(overrides: Partial<Contract> = {}) {
  return {
    id: "contract-1",
    unitId: "unit-1",
    tenantName: "测试租户",
    startDate: "2025-09-01",
    endDate: "2028-08-31",
    annualRent: 90000,
    billingFrequency: BillingFrequency.ANNUAL,
    deletedAt: null,
    ...overrides,
  } as Contract;
}

function buildService(options: {
  schedules?: Record<string, unknown>[];
  payments?: Record<string, unknown>[];
} = {}) {
  const schedulesRepository = {
    find: jest.fn().mockResolvedValue(options.schedules ?? []),
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((value) => value),
    save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const paymentsRepository = {
    find: jest.fn().mockResolvedValue(options.payments ?? []),
  };
  const allocationsRepository = {
    delete: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity.name === "RentReceivableSchedule") {
        return schedulesRepository;
      }
      if (entity.name === "RentPayment") {
        return paymentsRepository;
      }
      if (entity.name === "RentPaymentAllocation") {
        return allocationsRepository;
      }
      throw new Error(`Unexpected repository: ${entity.name}`);
    }),
  };
  const dataSource = {
    transaction: jest.fn().mockImplementation((callback) => callback(manager)),
  };
  const ServiceWithMocks = RentReceivablesService as unknown as new (
    schedulesRepository: unknown,
    paymentsRepository: unknown,
    dataSource: unknown,
  ) => RentReceivablesService;

  return {
    service: new ServiceWithMocks(
      schedulesRepository,
      paymentsRepository,
      dataSource,
    ),
    schedulesRepository,
    paymentsRepository,
    allocationsRepository,
    manager,
    dataSource,
  };
}

describe("RentReceivablesService", () => {
  it("keeps due or allocated schedules and replaces only unprotected future schedules", async () => {
    const existingSchedules = [
      schedule({
        id: "due",
        sequence: 1,
        periodStart: "2025-09-01",
        periodEnd: "2026-08-31",
        dueDate: "2025-09-01",
      }),
      schedule({
        id: "paid-future",
        sequence: 2,
        periodStart: "2026-09-01",
        periodEnd: "2027-08-31",
        dueDate: "2026-09-01",
        allocations: [{ allocatedAmount: 1000, deletedAt: null }],
      }),
      schedule({
        id: "free-future",
        sequence: 3,
        periodStart: "2027-09-01",
        periodEnd: "2028-08-31",
        dueDate: "2027-09-01",
      }),
    ];
    const { service, schedulesRepository, manager } = buildService({
      schedules: existingSchedules,
    });

    await service.syncContractSchedules(manager as never, contract());

    expect(schedulesRepository.delete).toHaveBeenCalledWith({
      id: expect.objectContaining({ _value: ["free-future"] }),
    });
    expect(schedulesRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        contractId: "contract-1",
        sequence: 3,
        dueDate: "2027-09-01",
      }),
    ]);
  });

  it("rejects a contract change that moves a protected schedule", async () => {
    const { service, manager } = buildService({
      schedules: [
        schedule({
          id: "due",
          sequence: 1,
          periodStart: "2025-08-01",
          periodEnd: "2026-07-31",
          dueDate: "2025-08-01",
        }),
      ],
    });

    await expect(
      service.syncContractSchedules(manager as never, contract()),
    ).rejects.toThrow(
      "合同修改会改变已到期或已收款期次，请先核对合同日期和收租周期",
    );
  });

  it("reports an invalid contract date range as a bad request", async () => {
    const { service, manager } = buildService();

    try {
      await service.syncContractSchedules(
        manager as never,
        contract({ startDate: "2027-01-02", endDate: "2027-01-01" }),
      );
      throw new Error("Expected syncContractSchedules to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toBe("合同结束日期不能早于开始日期");
    }
  });

  it("rebuilds allocations with repositories from the caller manager", async () => {
    const { service, manager, allocationsRepository } = buildService({
      schedules: [
        schedule({ id: "s2", sequence: 2, dueDate: "2027-09-01" }),
        schedule({ id: "s1", sequence: 1, dueDate: "2026-09-01" }),
      ],
      payments: [
        { id: "p-b", contractId: "contract-1", paymentDate: "2026-01-01", amount: 100000 },
        { id: "p-a", contractId: "contract-1", paymentDate: "2026-01-01", amount: 80000 },
      ],
    });

    const result = await service.rebuildPaymentAllocations(
      manager as never,
      "contract-1",
    );

    expect(result.allocations).toEqual([
      { rentPaymentId: "p-a", rentReceivableScheduleId: "s1", allocatedAmount: 80000 },
      { rentPaymentId: "p-b", rentReceivableScheduleId: "s1", allocatedAmount: 10000 },
      { rentPaymentId: "p-b", rentReceivableScheduleId: "s2", allocatedAmount: 90000 },
    ]);
    expect(allocationsRepository.delete).toHaveBeenCalledWith({
      rentReceivableScheduleId: expect.objectContaining({ _value: ["s2", "s1"] }),
    });
    expect(allocationsRepository.save).toHaveBeenCalledWith(result.allocations);
  });

  it("derives future payments as prepayment without adding them to due receivable", async () => {
    const { service } = buildService({
      schedules: [
        schedule({
          dueDate: "2027-09-01",
          allocations: [{ allocatedAmount: 90000, deletedAt: null }],
        }),
      ],
    });

    const result = await service.list({ contractId: "contract-1" });

    expect(result.items[0]).toMatchObject({
      status: RentReceivableStatus.PREPAID,
      dueReceivableAmount: 0,
      outstandingAmount: 0,
      prepaidAmount: 90000,
    });
  });

  it("filters serialized schedules by year and derived status", async () => {
    const { service } = buildService({
      schedules: [
        schedule({ id: "future", dueDate: "2027-09-01" }),
        schedule({
          id: "overdue",
          dueDate: "2025-09-01",
          allocations: [{ allocatedAmount: 1000, deletedAt: null }],
        }),
      ],
    });

    const result = await service.list({
      year: 2025,
      status: RentReceivableStatus.OVERDUE,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: "overdue", outstandingAmount: 89000 });
  });

  it("requires an active contract in list and detail queries", async () => {
    const { service, schedulesRepository } = buildService();
    schedulesRepository.findOne.mockResolvedValue(null);

    await service.list({ tenantName: "测试" });
    await expect(service.findOneOrFail("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(schedulesRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ contract: expect.any(Object) }),
      }),
    );
    expect(schedulesRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ contract: expect.any(Object) }),
      }),
    );
  });

  it("summarizes only due schedules as receivable while retaining prepayments and excess", async () => {
    const { service } = buildService({
      schedules: [
        schedule({
          id: "due",
          dueDate: "2025-09-01",
          receivableAmount: 90000,
          allocations: [{ allocatedAmount: 60000, deletedAt: null }],
        }),
        schedule({
          id: "future",
          sequence: 2,
          dueDate: "2027-09-01",
          receivableAmount: 90000,
          allocations: [{ allocatedAmount: 30000, deletedAt: null }],
        }),
      ],
      payments: [
        { id: "payment-1", contractId: "contract-1", amount: 100000 },
      ],
    });

    const summaries = await service.getContractSummaries(
      ["contract-1", "contract-2"],
      "2026-08-26",
    );

    expect(summaries.get("contract-1")).toEqual({
      dueReceivableAmount: 90000,
      duePaidAmount: 60000,
      outstandingAmount: 30000,
      prepaidAmount: 30000,
      unallocatedAmount: 10000,
    });
    expect(summaries.get("contract-2")).toEqual({
      dueReceivableAmount: 0,
      duePaidAmount: 0,
      outstandingAmount: 0,
      prepaidAmount: 0,
      unallocatedAmount: 0,
    });
  });

  it("updates an unpaid future schedule and rebuilds allocations in one transaction", async () => {
    const editable = schedule({ dueDate: "2027-09-01" });
    const { service, schedulesRepository, dataSource, manager } = buildService();
    schedulesRepository.findOne.mockResolvedValue(editable);

    const result = await service.update("schedule-1", {
      dueDate: "2027-10-01",
      receivableAmount: 95000,
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.getRepository).toHaveBeenCalled();
    expect(schedulesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: "2027-10-01", receivableAmount: 95000 }),
    );
    expect(result).toMatchObject({ dueDate: "2027-10-01", receivableAmount: 95000 });
  });

  it.each([
    [schedule({ dueDate: "2025-09-01" }), "已到期应收计划不能修改"],
    [
      schedule({
        dueDate: "2027-09-01",
        allocations: [{ allocatedAmount: 1000, deletedAt: null }],
      }),
      "已有收款分配的应收计划不能修改",
    ],
  ])("rejects protected schedule updates", async (existing, message) => {
    const { service, schedulesRepository } = buildService();
    schedulesRepository.findOne.mockResolvedValue(existing);

    await expect(
      service.update("schedule-1", {
        dueDate: "2027-10-01",
        receivableAmount: 95000,
      }),
    ).rejects.toEqual(new BadRequestException(message));
  });

  it("rejects non-positive amounts at the service boundary", async () => {
    const { service, schedulesRepository } = buildService();
    schedulesRepository.findOne.mockResolvedValue(
      schedule({ dueDate: "2027-09-01" }),
    );

    await expect(
      service.update("schedule-1", {
        dueDate: "2027-10-01",
        receivableAmount: 0,
      }),
    ).rejects.toThrow("应收金额必须大于 0");
  });

  it("rejects an amount below the amount already allocated", async () => {
    const { service, schedulesRepository } = buildService();
    schedulesRepository.findOne.mockResolvedValue(
      schedule({
        dueDate: "2027-09-01",
        allocations: [{ allocatedAmount: 1000, deletedAt: null }],
      }),
    );

    await expect(
      service.update("schedule-1", {
        dueDate: "2027-10-01",
        receivableAmount: 999,
      }),
    ).rejects.toEqual(
      new BadRequestException("应收金额不能低于已分配金额"),
    );
  });
});
