import { DepositsService } from "./deposits.service";

function deposit(overrides: Record<string, unknown> = {}) {
  return {
    id: "deposit-1",
    unitId: "unit-1",
    unit: {
      id: "unit-1",
      code: "A-101",
      location: "一层东侧",
    },
    contractId: "contract-1",
    tenantNameSnapshot: "测试租户",
    type: "received",
    amount: 10000,
    paymentDate: "2026-01-01",
    deletedAt: null,
    ...overrides,
  };
}

function contract(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract-1",
    unitId: "unit-1",
    tenantName: "测试租户",
    depositAmount: 10000,
    startDate: "2026-01-01",
    deletedAt: null,
    ...overrides,
  };
}

function buildAccountService(options: {
  deposits?: Record<string, unknown>[];
  contracts?: Record<string, unknown>[];
  sourceContract?: Record<string, unknown> | null;
} = {}) {
  const depositsRepository = {
    find: jest.fn().mockResolvedValue(options.deposits ?? []),
  };
  const contractsRepository = {
    find: jest.fn().mockResolvedValue(options.contracts ?? []),
    findOne: jest.fn().mockResolvedValue(options.sourceContract ?? null),
  };
  const filesService = {
    resolvePaymentVoucherFiles: jest.fn(),
  };
  const ServiceWithFiles = DepositsService as unknown as new (
    depositsRepository: unknown,
    contractsRepository: unknown,
    filesService: unknown,
  ) => DepositsService;

  return {
    service: new ServiceWithFiles(depositsRepository, contractsRepository, filesService),
    contractsRepository,
  };
}

describe("DepositsService", () => {
  it("groups active deposit flows by unit and trimmed exact tenant name", async () => {
    const { service } = buildAccountService({
      deposits: [
        deposit({ tenantNameSnapshot: " 大理石 ", type: "received", amount: 15000, paymentDate: "2025-09-01" }),
        deposit({ tenantNameSnapshot: "大理石", type: "refunded", amount: 3000, paymentDate: "2026-08-01" }),
        deposit({ tenantNameSnapshot: "大理石公司", type: "received", amount: 5000, paymentDate: "2026-08-02" }),
        deposit({ tenantNameSnapshot: "大理石", type: "received", amount: 9999, deletedAt: new Date() }),
      ],
      contracts: [
        contract({ tenantName: "大理石", depositAmount: 10000, startDate: "2025-09-01" }),
        contract({ id: "contract-2", tenantName: " 大理石 ", depositAmount: 13000, startDate: "2026-09-01" }),
        contract({ id: "contract-3", tenantName: "大理石公司", depositAmount: 5000, startDate: "2026-08-01" }),
      ],
    });

    const accounts = await service.listAccounts({ unitId: "unit-1" });

    expect(accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tenantName: "大理石",
        agreedDepositAmount: 13000,
        heldAmount: 12000,
        supplementAmount: 1000,
        refundAmount: 0,
        latestContractId: "contract-2",
        lastTransactionDate: "2026-08-01",
      }),
      expect.objectContaining({ tenantName: "大理石公司", heldAmount: 5000 }),
    ]));
    expect(accounts).toHaveLength(2);
  });

  it("preserves a negative ledger balance while clamping transferable calculations", async () => {
    const { service } = buildAccountService({
      deposits: [
        deposit({ type: "received", amount: 10000 }),
        deposit({ type: "refunded", amount: 16000, paymentDate: "2026-02-01" }),
      ],
      contracts: [contract({ depositAmount: 5000 })],
    });

    const account = await service.getAccount("unit-1", " 测试租户 ");

    expect(account).toEqual(expect.objectContaining({
      heldAmount: -6000,
      supplementAmount: 11000,
      refundAmount: 0,
    }));
  });

  it("uses the source contract tenant only when the source belongs to the requested unit", async () => {
    const sourceContract = contract({ id: "source-contract", tenantName: " 源租户 " });
    const { service, contractsRepository } = buildAccountService({
      deposits: [deposit({ tenantNameSnapshot: "源租户", amount: 8000 })],
      contracts: [sourceContract],
      sourceContract,
    });

    await expect(service.getAccount("unit-1", "新租户", "source-contract")).resolves.toEqual(
      expect.objectContaining({ tenantName: "源租户", heldAmount: 8000 }),
    );

    contractsRepository.findOne.mockResolvedValue(contract({ unitId: "unit-2" }));
    await expect(service.getAccount("unit-1", "新租户", "source-contract")).resolves.toBeNull();
    await expect(service.getAccount("unit-1", " ")).resolves.toBeNull();
  });

  it("associates uploaded payment voucher images when creating a deposit record", async () => {
    const depositsRepository = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockImplementation((deposit) => Promise.resolve(deposit)),
    };
    const contractsRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: "contract-1",
        unitId: "unit-1",
        tenantName: "测试租户",
      }),
    };
    const filesService = {
      resolvePaymentVoucherFiles: jest.fn().mockResolvedValue([
        {
          id: "voucher-1",
          category: "payment-voucher",
          mimeType: "image/png",
        },
      ]),
    };
    const ServiceWithFiles = DepositsService as unknown as new (
      depositsRepository: unknown,
      contractsRepository: unknown,
      filesService: unknown,
    ) => DepositsService;
    const service = new ServiceWithFiles(depositsRepository, contractsRepository, filesService);

    await service.create({
      contractId: "contract-1",
      type: "received",
      paymentDate: "2026-07-17",
      amount: 10000,
      method: "转账",
      note: "",
      attachmentFileIds: ["voucher-1"],
    } as never);

    expect(filesService.resolvePaymentVoucherFiles).toHaveBeenCalledWith(["voucher-1"]);
    expect(depositsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentFiles: [
          expect.objectContaining({
            id: "voucher-1",
          }),
        ],
      }),
    );
  });
});
