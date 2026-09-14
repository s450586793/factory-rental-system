import { EntityManager } from "typeorm";
import { Contract } from "./contract.entity";
import { ContractFinancialHistory } from "./contract-financial-history.entity";

export type ContractActor = { id: string; username: string };

const FIELD_SCALES = {
  annualRent: 2,
  depositAmount: 2,
  electricUnitPrice: 4,
  electricLineLossPercent: 2,
  waterUnitPrice: 4,
  earlyTerminationPenaltyAmount: 2,
} as const;

export async function appendContractFinancialHistory(
  manager: EntityManager,
  before: Contract | null,
  after: Contract,
  actor?: ContractActor,
) {
  const repository = manager.getRepository(ContractFinancialHistory);
  const entries = Object.entries(FIELD_SCALES).flatMap(([name, scale]) => {
    const field = name as keyof typeof FIELD_SCALES;
    const beforeValue =
      before === null ? null : Number(before[field]).toFixed(scale);
    const afterValue = Number(after[field]).toFixed(scale);
    return beforeValue === afterValue
      ? []
      : [
          repository.create({
            contractId: after.id,
            field,
            beforeValue,
            afterValue,
            actorId: actor?.id ?? null,
            actorUsername: actor?.username ?? null,
          }),
        ];
  });
  if (entries.length) {
    await repository.insert(entries);
  }
}
