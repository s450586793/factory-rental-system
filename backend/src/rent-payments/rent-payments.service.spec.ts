import { validate } from "class-validator";
import { Contract } from "../contracts/contract.entity";
import {
  Receipt,
  ReceiptSourceType,
  ReceiptStatus,
} from "../receipts/receipt.entity";
import { RentPaymentAllocation } from "../rent-receivables/rent-payment-allocation.entity";
import { RentReceivableSchedule } from "../rent-receivables/rent-receivable-schedule.entity";
import {
  CreateRentPaymentDto,
  PreviewRentPaymentAllocationDto,
} from "./rent-payments.dto";
import { RentPayment } from "./rent-payment.entity";
import { RentPaymentsService } from "./rent-payments.service";

const contract = {
  id: "contract-1",
  unitId: "unit-1",
  tenantName: "测试租户",
};

const schedule = {
  id: "schedule-1",
  contractId: "contract-1",
  sequence: 1,
  periodStart: "2026-09-01",
  periodEnd: "2027-08-31",
  dueDate: "2026-09-01",
  receivableAmount: 100000,
};

const fullPayment = {
  id: "payment-1",
  contractId: "contract-1",
  contract,
  unitId: "unit-1",
  unit: { id: "unit-1", name: "A-01" },
  tenantNameSnapshot: "测试租户",
  paymentDate: "2026-09-01",
  amount: 100000,
  method: "转账",
  note: null,
  attachmentFiles: [{ id: "voucher-1" }],
};

function createDto(overrides: Record<string, unknown> = {}) {
  return {
    contractId: "contract-1",
    paymentDate: "2026-09-01",
    amount: 100000,
    method: " 转账 ",
    note: "",
    attachmentFileIds: ["voucher-1"],
    ...overrides,
  };
}

function buildService(
  options: {
    existingPayment?: Record<string, unknown> | null;
    activeReceipt?: Record<string, unknown> | null;
    contract?: Record<string, unknown>;
    contracts?: Record<string, Record<string, unknown> | null>;
    previewContract?: Record<string, unknown> | null;
    previewExcludePayment?: Record<string, unknown> | null;
    previewPayments?: Array<Record<string, unknown>>;
    schedules?: Array<Record<string, unknown>>;
    rebuildResult?: {
      allocations: Array<{
        rentPaymentId: string;
        rentReceivableScheduleId: string;
        allocatedAmount: number;
      }>;
      unallocatedPayments: Array<{ rentPaymentId: string; amount: number }>;
    };
    rebuildError?: Error;
  } = {},
) {
  const existingPayment = options.existingPayment
    ? { ...options.existingPayment }
    : null;
  const transactionalPaymentsRepository = {
    create: jest.fn().mockReturnValue({}),
    findOne: jest.fn().mockResolvedValue(existingPayment),
    findOneOrFail: jest.fn().mockResolvedValue(fullPayment),
    save: jest.fn().mockImplementation((payment) =>
      Promise.resolve({
        ...payment,
        id: (payment as { id?: string }).id ?? "payment-1",
      }),
    ),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const contractsRepository = {
    findOne: jest.fn().mockImplementation(({ where }) => {
      const contractId = (where as { id: string }).id;
      if (options.contracts && contractId in options.contracts) {
        return Promise.resolve(options.contracts[contractId]);
      }
      if (options.contract?.id === contractId) {
        return Promise.resolve(options.contract);
      }
      return Promise.resolve({ ...contract, id: contractId });
    }),
  };
  const receiptsRepository = {
    findOne: jest.fn().mockResolvedValue(options.activeReceipt ?? null),
  };
  const schedulesRepository = {
    find: jest.fn().mockResolvedValue(options.schedules ?? [schedule]),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === RentPayment) {
        return transactionalPaymentsRepository;
      }
      if (entity === Contract) {
        return contractsRepository;
      }
      if (entity === Receipt) {
        return receiptsRepository;
      }
      if (entity === RentReceivableSchedule) {
        return schedulesRepository;
      }
      if (entity === RentPaymentAllocation) {
        throw new Error(
          "Rent payment service must not persist allocations directly",
        );
      }
      throw new Error(`Unexpected repository: ${entity.name}`);
    }),
  };
  const dataSource = {
    transaction: jest.fn().mockImplementation((callback) => callback(manager)),
  };
  const previewContract = Object.prototype.hasOwnProperty.call(
    options,
    "previewContract",
  )
    ? options.previewContract
    : contract;
  const previewExcludePayment = Object.prototype.hasOwnProperty.call(
    options,
    "previewExcludePayment",
  )
    ? options.previewExcludePayment
    : existingPayment;
  const rootContractsRepository = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        (previewContract as { deletedAt?: Date | null } | null | undefined)
          ?.deletedAt == null
          ? previewContract
          : null,
      ),
  };
  const activePreviewExcludePayment =
    previewExcludePayment?.contract &&
    (previewExcludePayment.contract as { deletedAt?: Date | null }).deletedAt !=
      null
      ? null
      : previewExcludePayment;
  const rentPaymentsRepository = {
    find: jest
      .fn()
      .mockResolvedValue(
        options.previewPayments ?? (existingPayment ? [existingPayment] : []),
      ),
    findOne: jest.fn().mockResolvedValue(activePreviewExcludePayment),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  };
  const filesService = {
    resolvePaymentVoucherFiles: jest
      .fn()
      .mockResolvedValue([{ id: "voucher-1" }]),
  };
  const defaultRebuildResult = {
    allocations: [
      {
        rentPaymentId: "payment-1",
        rentReceivableScheduleId: "schedule-1",
        allocatedAmount: 100000,
      },
    ],
    unallocatedPayments: [],
  };
  const rentReceivablesService = {
    rebuildPaymentAllocations: options.rebuildError
      ? jest.fn().mockRejectedValue(options.rebuildError)
      : jest
          .fn()
          .mockResolvedValue(options.rebuildResult ?? defaultRebuildResult),
  };
  const ServiceWithMocks = RentPaymentsService as unknown as new (
    rentPaymentsRepository: unknown,
    contractsRepository: unknown,
    schedulesRepository: unknown,
    filesService: unknown,
    dataSource: unknown,
    rentReceivablesService: unknown,
  ) => RentPaymentsService;

  return {
    service: new ServiceWithMocks(
      rentPaymentsRepository,
      rootContractsRepository,
      schedulesRepository,
      filesService,
      dataSource,
      rentReceivablesService,
    ),
    contractsRepository,
    dataSource,
    filesService,
    manager,
    receiptsRepository,
    rentPaymentsRepository,
    rentReceivablesService,
    rootContractsRepository,
    schedulesRepository,
    transactionalPaymentsRepository,
  };
}

describe("RentPaymentsService", () => {
  it("saves and rebuilds allocations with the same transaction manager", async () => {
    const {
      service,
      contractsRepository,
      dataSource,
      filesService,
      manager,
      rentPaymentsRepository,
      rentReceivablesService,
      transactionalPaymentsRepository,
    } = buildService();

    const result = await service.create(createDto() as never);

    expect(filesService.resolvePaymentVoucherFiles).toHaveBeenCalledWith([
      "voucher-1",
    ]);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(contractsRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: "contract-1",
        deletedAt: expect.objectContaining({ _type: "isNull" }),
      },
      lock: { mode: "pessimistic_write" },
    });
    expect(transactionalPaymentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentFiles: [{ id: "voucher-1" }],
        method: "转账",
        note: "",
      }),
    );
    expect(rentPaymentsRepository.save).not.toHaveBeenCalled();
    expect(
      rentReceivablesService.rebuildPaymentAllocations,
    ).toHaveBeenCalledWith(manager, "contract-1");
    expect(result).toEqual({
      payment: fullPayment,
      allocations: [
        {
          scheduleId: "schedule-1",
          sequence: 1,
          periodStart: "2026-09-01",
          periodEnd: "2027-08-31",
          allocatedAmount: 100000,
        },
      ],
      unallocatedAmount: 0,
    });
  });

  it("updates a payment and rebuilds allocations in one transaction", async () => {
    const {
      service,
      manager,
      receiptsRepository,
      rentReceivablesService,
      transactionalPaymentsRepository,
    } = buildService({ existingPayment: fullPayment });

    await service.update("payment-1", createDto({ amount: 90000 }) as never);

    expect(receiptsRepository.findOne).toHaveBeenCalledWith({
      where: {
        sourceType: ReceiptSourceType.RENT_PAYMENT,
        sourceId: "payment-1",
        status: ReceiptStatus.ACTIVE,
      },
    });
    expect(transactionalPaymentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "payment-1", amount: 90000 }),
    );
    expect(
      rentReceivablesService.rebuildPaymentAllocations,
    ).toHaveBeenCalledWith(manager, "contract-1");
  });

  it("rebuilds both contracts when moving a payment between contracts", async () => {
    const oldContract = {
      ...contract,
      id: "contract-z",
    };
    const newContract = {
      id: "contract-a",
      unitId: "unit-2",
      tenantName: "新租户",
    };
    const movingPayment = {
      ...fullPayment,
      contractId: oldContract.id,
      contract: oldContract,
    };
    const {
      service,
      contractsRepository,
      dataSource,
      manager,
      receiptsRepository,
      rentReceivablesService,
      transactionalPaymentsRepository,
    } = buildService({
      existingPayment: movingPayment,
      contracts: {
        [oldContract.id]: oldContract,
        [newContract.id]: newContract,
      },
    });

    await service.update(
      "payment-1",
      createDto({ contractId: newContract.id }) as never,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(transactionalPaymentsRepository.findOne).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      lock: { mode: "pessimistic_write" },
      loadEagerRelations: false,
    });
    expect(
      contractsRepository.findOne.mock.calls.map(
        ([query]) => (query.where as { id: string }).id,
      ),
    ).toEqual(["contract-a", "contract-z"]);
    expect(contractsRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: {
        id: "contract-a",
        deletedAt: expect.objectContaining({ _type: "isNull" }),
      },
      lock: { mode: "pessimistic_write" },
    });
    expect(contractsRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: {
        id: "contract-z",
        deletedAt: expect.objectContaining({ _type: "isNull" }),
      },
      lock: { mode: "pessimistic_write" },
    });
    expect(
      contractsRepository.findOne.mock.invocationCallOrder[1],
    ).toBeLessThan(receiptsRepository.findOne.mock.invocationCallOrder[0]);
    expect(receiptsRepository.findOne.mock.invocationCallOrder[0]).toBeLessThan(
      transactionalPaymentsRepository.save.mock.invocationCallOrder[0],
    );
    expect(
      rentReceivablesService.rebuildPaymentAllocations,
    ).toHaveBeenNthCalledWith(1, manager, "contract-a");
    expect(
      rentReceivablesService.rebuildPaymentAllocations,
    ).toHaveBeenNthCalledWith(2, manager, "contract-z");
  });

  it("rejects an update with an active receipt before saving or rebuilding", async () => {
    const { service, rentReceivablesService, transactionalPaymentsRepository } =
      buildService({
        existingPayment: fullPayment,
        activeReceipt: { id: "receipt-1" },
      });

    await expect(
      service.update("payment-1", createDto() as never),
    ).rejects.toThrow("该房租记录已经开具收据，不能再修改或删除");
    expect(transactionalPaymentsRepository.save).not.toHaveBeenCalled();
    expect(
      rentReceivablesService.rebuildPaymentAllocations,
    ).not.toHaveBeenCalled();
  });

  it("soft-deletes a payment and rebuilds later FIFO allocations in one transaction", async () => {
    const {
      service,
      contractsRepository,
      manager,
      receiptsRepository,
      rentReceivablesService,
      transactionalPaymentsRepository,
    } = buildService({ existingPayment: fullPayment });

    const result = await service.remove("payment-1");

    expect(transactionalPaymentsRepository.findOne).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      lock: { mode: "pessimistic_write" },
      loadEagerRelations: false,
    });
    expect(contractsRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: "contract-1",
        deletedAt: expect.objectContaining({ _type: "isNull" }),
      },
      lock: { mode: "pessimistic_write" },
    });
    expect(
      contractsRepository.findOne.mock.invocationCallOrder[0],
    ).toBeLessThan(receiptsRepository.findOne.mock.invocationCallOrder[0]);
    expect(receiptsRepository.findOne.mock.invocationCallOrder[0]).toBeLessThan(
      transactionalPaymentsRepository.softDelete.mock.invocationCallOrder[0],
    );
    expect(transactionalPaymentsRepository.softDelete).toHaveBeenCalledWith(
      "payment-1",
    );
    expect(transactionalPaymentsRepository.findOneOrFail).toHaveBeenCalledWith({
      where: { id: "payment-1" },
    });
    expect(
      rentReceivablesService.rebuildPaymentAllocations,
    ).toHaveBeenCalledWith(manager, "contract-1");
    expect(result).toEqual({
      payment: fullPayment,
      allocations: [],
      unallocatedAmount: 0,
    });
  });

  it("rejects removal with an active receipt before soft-delete or rebuilding", async () => {
    const { service, rentReceivablesService, transactionalPaymentsRepository } =
      buildService({
        existingPayment: fullPayment,
        activeReceipt: { id: "receipt-1" },
      });

    await expect(service.remove("payment-1")).rejects.toThrow(
      "该房租记录已经开具收据，不能再修改或删除",
    );
    expect(transactionalPaymentsRepository.softDelete).not.toHaveBeenCalled();
    expect(
      rentReceivablesService.rebuildPaymentAllocations,
    ).not.toHaveBeenCalled();
  });

  it("propagates allocation rebuild failure without writing through the root repository", async () => {
    const rebuildError = new Error("allocation rebuild failed");
    const {
      service,
      dataSource,
      rentPaymentsRepository,
      transactionalPaymentsRepository,
    } = buildService({ rebuildError });

    await expect(service.create(createDto() as never)).rejects.toThrow(
      rebuildError,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(transactionalPaymentsRepository.save).toHaveBeenCalledTimes(1);
    expect(rentPaymentsRepository.save).not.toHaveBeenCalled();
  });

  it("resolves attachments before opening the payment transaction", async () => {
    const { service, dataSource, filesService } = buildService();
    filesService.resolvePaymentVoucherFiles.mockRejectedValue(
      new Error("invalid attachment"),
    );

    await expect(service.create(createDto() as never)).rejects.toThrow(
      "invalid attachment",
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it("previews an edited payment after excluding its old amount without writing", async () => {
    const oldPayment = {
      ...fullPayment,
      amount: 50000,
      paymentDate: "2026-08-01",
    };
    const {
      service,
      dataSource,
      rentPaymentsRepository,
      rentReceivablesService,
      transactionalPaymentsRepository,
    } = buildService({ existingPayment: oldPayment });

    const result = await service.previewAllocation({
      contractId: "contract-1",
      paymentDate: "2026-09-01",
      amount: 120000,
      excludePaymentId: "payment-1",
    });

    expect(result).toEqual({
      allocations: [
        {
          scheduleId: "schedule-1",
          sequence: 1,
          periodStart: "2026-09-01",
          periodEnd: "2027-08-31",
          allocatedAmount: 100000,
        },
      ],
      unallocatedAmount: 20000,
    });
    expect(rentPaymentsRepository.find).toHaveBeenCalledWith({
      where: { contractId: "contract-1" },
      order: { paymentDate: "ASC", id: "ASC" },
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(transactionalPaymentsRepository.save).not.toHaveBeenCalled();
    expect(
      rentReceivablesService.rebuildPaymentAllocations,
    ).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["soft-deleted", { ...contract, deletedAt: new Date("2026-08-01") }],
  ])("rejects a %s preview target contract", async (_case, candidate) => {
    const { service, rootContractsRepository, schedulesRepository } =
      buildService({ previewContract: candidate });

    await expect(
      service.previewAllocation({
        contractId: "contract-1",
        paymentDate: "2026-09-01",
        amount: 100,
      }),
    ).rejects.toThrow("目标合同不存在或已删除");

    expect(rootContractsRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: "contract-1",
        deletedAt: expect.objectContaining({ _type: "isNull" }),
      },
    });
    expect(schedulesRepository.find).not.toHaveBeenCalled();
  });

  it.each([
    ["is missing", null],
    [
      "belongs to a soft-deleted contract",
      {
        ...fullPayment,
        contract: { ...contract, deletedAt: new Date("2026-08-01") },
      },
    ],
  ])("rejects an excluded payment that is %s", async (_case, candidate) => {
    const { service, rentPaymentsRepository, schedulesRepository } =
      buildService({ previewExcludePayment: candidate });

    await expect(
      service.previewAllocation({
        contractId: "contract-1",
        paymentDate: "2026-09-01",
        amount: 100,
        excludePaymentId: "payment-1",
      }),
    ).rejects.toThrow("原房租收费记录不存在或已删除");

    expect(rentPaymentsRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: "payment-1",
        contract: {
          deletedAt: expect.objectContaining({ _type: "isNull" }),
        },
      },
    });
    expect(schedulesRepository.find).not.toHaveBeenCalled();
  });

  it("allows an excluded payment from a different active contract", async () => {
    const oldContractPayment = {
      ...fullPayment,
      contractId: "contract-1",
    };
    const { service } = buildService({
      previewContract: { ...contract, id: "contract-2" },
      previewExcludePayment: oldContractPayment,
      previewPayments: [],
    });

    await expect(
      service.previewAllocation({
        contractId: "contract-2",
        paymentDate: "2026-09-01",
        amount: 100000,
        excludePaymentId: "payment-1",
      }),
    ).resolves.toMatchObject({ unallocatedAmount: 0 });
  });

  it("preserves the excluded payment id ordering for same-day edit preview", async () => {
    const secondSchedule = {
      ...schedule,
      id: "schedule-2",
      sequence: 2,
      periodStart: "2027-09-01",
      periodEnd: "2028-08-31",
      dueDate: "2027-09-01",
    };
    const editedPayment = {
      ...fullPayment,
      id: "payment-b",
      amount: 50000,
      paymentDate: "2026-09-01",
    };
    const laterSameDayPayment = {
      ...fullPayment,
      id: "payment-a",
      amount: 100000,
      paymentDate: "2026-09-01",
    };
    const { service } = buildService({
      previewExcludePayment: editedPayment,
      previewPayments: [editedPayment, laterSameDayPayment],
      schedules: [schedule, secondSchedule],
    });

    const result = await service.previewAllocation({
      contractId: "contract-1",
      paymentDate: "2026-09-01",
      amount: 100000,
      excludePaymentId: "payment-b",
    });

    expect(result.allocations).toEqual([
      {
        scheduleId: "schedule-2",
        sequence: 2,
        periodStart: "2027-09-01",
        periodEnd: "2028-08-31",
        allocatedAmount: 100000,
      },
    ]);
  });
});

describe("Rent payment amount validation", () => {
  it("rejects a create amount below one cent", async () => {
    const dto = Object.assign(
      new CreateRentPaymentDto(),
      createDto({ amount: 0 }),
    );

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: "amount" })]),
    );
  });

  it("exports a preview DTO that rejects an amount below one cent", async () => {
    const dto = Object.assign(new PreviewRentPaymentAllocationDto(), {
      contractId: "contract-1",
      paymentDate: "2026-09-01",
      amount: 0,
    });

    const errors = await validate(dto);
    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: "amount" })]),
    );
  });
});
