# 租金应收计划与押金结转实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将法律合同、逐期租金应收、真实收款和押金余额分离，使多年合同按年或半年到期、付款按 FIFO 分配，并让同房源同租户续租沿用一次性押金。

**Architecture:** 新增持久化的 `rent_receivable_schedules` 与 `rent_payment_allocations`，纯函数负责按分生成计划和分配付款，NestJS 服务只负责事务、查询和业务保护。合同保存时同步计划，收款变动时重建分配；押金余额继续以真实收退流水为唯一账本，合同只保存结转快照。Vue 页面消费同一组后端汇总字段，合同历史、收费、押金和对账不再各自推导金额。

**Tech Stack:** TypeScript 5、NestJS 11、TypeORM 0.3、PostgreSQL 16、Jest 29、Vue 3、Element Plus、Vitest 3、PDFKit/pdf-lib、Docker Compose、GitHub Actions、GHCR、Synology DSM。

**Spec:** `docs/superpowers/specs/2026-08-26-rent-schedule-deposit-carryover-design.md`

## Global Constraints

- `annualRent` 始终是一整个租赁年度的总租金。
- 收租周期仅支持 `annual`（按年）和 `semiannual`（按半年），默认 `annual`。
- 每期到期日等于该期 `periodStart`；未来期次不进入已到期应收或当前欠费。
- 最后不足一年或半年仍收完整一期，不按天折算。
- 半年金额按分拆分；第一期取得不能均分的 1 分，两期之和严格等于年租金。
- 有效付款按 `paymentDate`、`id` 升序 FIFO 分配，一笔付款允许跨期，多余金额记未分配结余。
- 修改合同只能重建未来且无分配的计划；已到期或已有分配的计划必须保持。
- 历史合同全部默认按年生成计划，历史有效收款严格按记录重算，不虚构收款或核销欠费。
- 押金余额只由有效押金收退流水计算；同房源、`trim` 后完全相同的租户名称才自动匹配。
- 押金结转只保存签约快照，不自动创建收取或退款流水。
- 所有金额计算先转整数分，数据库边界再转为两位小数。
- 所有写入计划、付款、分配或合同的复合操作必须在同一数据库事务内完成。
- API 错误只返回明确中文业务信息，不返回数据库错误、存储路径或凭据。
- 版本发布为 `V0.6.0`；不修改 DSM 现有数据库卷和附件卷。
- 不提交、不删除仓库内未跟踪的 `.workflow/`。

---

## File Map

**后端新增文件**

- `backend/src/common/money/cents.ts`：金额与整数分转换。
- `backend/src/common/money/cents.spec.ts`：金额边界测试。
- `backend/src/contracts/contract.enums.ts`：合同收租周期与押金处理枚举。
- `backend/src/rent-receivables/rent-schedule.ts`：按年/半年生成完整应收计划。
- `backend/src/rent-receivables/rent-schedule.spec.ts`：日期、闰年、奇数分和不足整期测试。
- `backend/src/rent-receivables/rent-allocation.ts`：FIFO 分配纯函数。
- `backend/src/rent-receivables/rent-allocation.spec.ts`：部分、跨期、预收和超额付款测试。
- `backend/src/rent-receivables/rent-receivable-schedule.entity.ts`：应收计划实体。
- `backend/src/rent-receivables/rent-payment-allocation.entity.ts`：付款分配实体。
- `backend/src/rent-receivables/rent-receivables.dto.ts`：查询、修改和响应 DTO。
- `backend/src/rent-receivables/rent-receivables.service.ts`：计划同步、状态、汇总和分配重建。
- `backend/src/rent-receivables/rent-receivables.service.spec.ts`：计划保护、状态和事务协作测试。
- `backend/src/rent-receivables/rent-receivables.controller.ts`：应收计划 API。
- `backend/src/rent-receivables/rent-receivables.module.ts`：应收模块注册。
- `backend/src/database/migrations/1712600000000-add-rent-receivable-schedules.ts`：结构和历史数据回填。
- `backend/src/database/migrations/1712600000000-add-rent-receivable-schedules.spec.ts`：迁移 SQL 回归测试。
- `frontend/src/utils/rent-schedule-preview.ts`：合同表单期次数量和首期到期日预览。
- `frontend/src/utils/rent-schedule-preview.spec.ts`：前端预览边界测试。
- `frontend/src/views/RentPaymentsView.receivables.spec.ts`：应收页签和分配预览测试。
- `frontend/src/views/DepositsView.accounts.spec.ts`：押金账户汇总测试。

**后端修改文件**

- `backend/src/contracts/contract.entity.ts`、`contracts.dto.ts`、`contracts.service.ts`、`contracts.module.ts` 及对应测试：新增合同字段并事务同步计划。
- `backend/src/rent-payments/rent-payment.entity.ts`、`rent-payments.dto.ts`、`rent-payments.service.ts`、`rent-payments.controller.ts`、`rent-payments.module.ts` 及测试：收款事务、分配重建和预览。
- `backend/src/deposits/deposits.dto.ts`、`deposits.service.ts`、`deposits.controller.ts`、`deposits.module.ts` 及测试：押金账户查询和结转来源解析。
- `backend/src/units/units.service.ts`、`units.module.ts` 及测试：统一合同财务汇总。
- `backend/src/rent-reconciliation/*`：从保存的计划和分配构造对账与 PDF。
- `backend/src/database/entities.ts`、`database/typeorm.config.ts`、`app.module.ts`：注册实体、迁移和模块。

**前端修改文件**

- `frontend/src/generated/openapi.ts`、`types/models.ts`、`api/index.ts`：增加合同、计划、分配和押金账户类型/API。
- `frontend/src/views/UnitsView.vue` 及 `UnitsView.contract-download.spec.ts`：收租周期、计划预览、押金结转和查看期次。
- `frontend/src/views/RentPaymentsView.vue` 及现有凭证测试：应收计划/收款记录页签和登记收款。
- `frontend/src/views/DepositsView.vue` 及现有凭证测试：押金账户汇总。
- `frontend/src/features/rent-reconciliation/types.ts`、`api.ts`、`views/RentReconciliationView.vue` 及测试：按保存计划展示对账。
- `frontend/src/styles/base.css`：新增紧凑状态、差额和响应式布局。
- `README.md`、`docs/database-schema.md`、两端 `package.json`/lock、`frontend/src/config/app-meta.ts`：发布 `V0.6.0`。

---

### Task 1: 金额与应收计划纯函数

**Files:**
- Create: `backend/src/common/money/cents.ts`
- Create: `backend/src/common/money/cents.spec.ts`
- Create: `backend/src/contracts/contract.enums.ts`
- Create: `backend/src/rent-receivables/rent-schedule.ts`
- Create: `backend/src/rent-receivables/rent-schedule.spec.ts`

**Interfaces:**
- Produces: `toCents(value: number): number`、`fromCents(value: number): number`。
- Produces: `BillingFrequency.ANNUAL | BillingFrequency.SEMIANNUAL`。
- Produces: `DepositSettlementMode.INITIAL | DepositSettlementMode.CARRYOVER`。
- Produces: `buildRentSchedule(source: RentScheduleSource): GeneratedRentSchedule[]`。

- [ ] **Step 1: 写金额和计划生成失败测试**

```ts
it("splits odd annual cents between two semiannual periods", () => {
  expect(buildRentSchedule({
    startDate: "2026-01-31",
    endDate: "2026-12-31",
    annualRent: 100000.01,
    billingFrequency: BillingFrequency.SEMIANNUAL,
  })).toEqual([
    { sequence: 1, periodStart: "2026-01-31", periodEnd: "2026-07-30", dueDate: "2026-01-31", receivableAmount: 50000.01 },
    { sequence: 2, periodStart: "2026-07-31", periodEnd: "2026-12-31", dueDate: "2026-07-31", receivableAmount: 50000 },
  ]);
});

it("charges a complete final period without daily proration", () => {
  expect(buildRentSchedule({
    startDate: "2025-02-28",
    endDate: "2026-03-31",
    annualRent: 120000,
    billingFrequency: BillingFrequency.ANNUAL,
  }).map((item) => item.receivableAmount)).toEqual([120000, 120000]);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && npm test -- --runTestsByPath src/common/money/cents.spec.ts src/rent-receivables/rent-schedule.spec.ts`

Expected: FAIL，提示模块或导出不存在。

- [ ] **Step 3: 实现最小纯函数**

```ts
export function toCents(value: number) {
  return Math.round(Number(value) * 100);
}

export function fromCents(value: number) {
  return Number((value / 100).toFixed(2));
}
```

```ts
export enum BillingFrequency {
  ANNUAL = "annual",
  SEMIANNUAL = "semiannual",
}

export enum DepositSettlementMode {
  INITIAL = "initial",
  CARRYOVER = "carryover",
}
```

`buildRentSchedule` 必须从合同开始日锚定计算第 `n * 6` 或 `n * 12` 个月，目标月份没有原日期时取月末；每期结束日取下一期开始日前一天并限制在合同结束日。半年金额使用 `Math.ceil(annualRentCents / 2)` 与 `Math.floor(annualRentCents / 2)` 交替生成。

```ts
export type RentScheduleSource = {
  startDate: string;
  endDate: string;
  annualRent: number;
  billingFrequency: BillingFrequency;
};

export type GeneratedRentSchedule = {
  sequence: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  receivableAmount: number;
};

export function buildRentSchedule(source: RentScheduleSource): GeneratedRentSchedule[] {
  if (source.startDate > source.endDate) throw new Error("合同结束日期不能早于开始日期");
  const annualRentCents = toCents(source.annualRent);
  if (annualRentCents <= 0) throw new Error("年租金必须大于 0");
  const intervalMonths = source.billingFrequency === BillingFrequency.SEMIANNUAL ? 6 : 12;
  const amounts = source.billingFrequency === BillingFrequency.SEMIANNUAL
    ? [Math.ceil(annualRentCents / 2), Math.floor(annualRentCents / 2)]
    : [annualRentCents];
  const periods: GeneratedRentSchedule[] = [];
  for (let index = 0; ; index += 1) {
    const periodStart = addLeaseMonths(source.startDate, index * intervalMonths);
    if (periodStart > source.endDate) break;
    const nextStart = addLeaseMonths(source.startDate, (index + 1) * intervalMonths);
    periods.push({
      sequence: index + 1,
      periodStart,
      periodEnd: minIsoDate(source.endDate, previousIsoDate(nextStart)),
      dueDate: periodStart,
      receivableAmount: fromCents(amounts[index % amounts.length]),
    });
  }
  return periods;
}
```

- [ ] **Step 4: 补齐 1/2/3 年、跨月末、闰年、未来合同和非法输入测试并运行**

Run: `cd backend && npm test -- --runTestsByPath src/common/money/cents.spec.ts src/rent-receivables/rent-schedule.spec.ts`

Expected: PASS，且覆盖按年 3 条、按半年 6 条、`2024-02-29`、`2026-01-31`、不足整期和金额小于等于零。

- [ ] **Step 5: 提交**

```bash
git add backend/src/common/money/cents.ts backend/src/common/money/cents.spec.ts backend/src/contracts/contract.enums.ts backend/src/rent-receivables/rent-schedule.ts backend/src/rent-receivables/rent-schedule.spec.ts
git commit -m "feat: 增加租金应收计划生成规则"
```

---

### Task 2: FIFO 付款分配纯函数

**Files:**
- Create: `backend/src/rent-receivables/rent-allocation.ts`
- Create: `backend/src/rent-receivables/rent-allocation.spec.ts`

**Interfaces:**
- Consumes: `toCents`、`fromCents`。
- Produces: `allocateRentPayments(schedules, payments): RentAllocationResult`。
- Produces: `RentAllocationResult.allocations` 和 `RentAllocationResult.unallocatedPayments`。

- [ ] **Step 1: 写 FIFO 失败测试**

```ts
it("allocates a payment across the oldest schedules and keeps excess unallocated", () => {
  const result = allocateRentPayments(
    [
      { id: "s1", dueDate: "2025-09-01", sequence: 1, receivableAmount: 90000 },
      { id: "s2", dueDate: "2026-09-01", sequence: 2, receivableAmount: 90000 },
    ],
    [
      { id: "p1", paymentDate: "2025-09-01", amount: 100000 },
      { id: "p2", paymentDate: "2026-01-01", amount: 90000 },
    ],
  );
  expect(result.allocations).toEqual([
    { rentPaymentId: "p1", rentReceivableScheduleId: "s1", allocatedAmount: 90000 },
    { rentPaymentId: "p1", rentReceivableScheduleId: "s2", allocatedAmount: 10000 },
    { rentPaymentId: "p2", rentReceivableScheduleId: "s2", allocatedAmount: 80000 },
  ]);
  expect(result.unallocatedPayments).toEqual([{ rentPaymentId: "p2", amount: 10000 }]);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && npm test -- --runTestsByPath src/rent-receivables/rent-allocation.spec.ts`

Expected: FAIL，提示 `allocateRentPayments` 不存在。

- [ ] **Step 3: 实现稳定排序和整数分分配**

```ts
export function allocateRentPayments(
  schedules: AllocationSchedule[],
  payments: AllocationPayment[],
): RentAllocationResult {
  const remainingBySchedule = new Map(
    [...schedules]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.sequence - b.sequence)
      .map((item) => [item.id, toCents(item.receivableAmount)]),
  );
  const allocations: RentAllocation[] = [];
  const unallocatedPayments: UnallocatedPayment[] = [];
  for (const payment of [...payments].sort(comparePayments)) {
    let remaining = toCents(payment.amount);
    for (const schedule of sortedSchedules) {
      const available = remainingBySchedule.get(schedule.id) ?? 0;
      const allocated = Math.min(remaining, available);
      if (allocated > 0) {
        allocations.push({
          rentPaymentId: payment.id,
          rentReceivableScheduleId: schedule.id,
          allocatedAmount: fromCents(allocated),
        });
        remainingBySchedule.set(schedule.id, available - allocated);
        remaining -= allocated;
      }
      if (remaining === 0) break;
    }
    if (remaining > 0) {
      unallocatedPayments.push({ rentPaymentId: payment.id, amount: fromCents(remaining) });
    }
  }
  return { allocations, unallocatedPayments };
}
```

- [ ] **Step 4: 补齐部分付款、同日 ID 排序、未来预收、空计划和 0.01 元测试**

Run: `cd backend && npm test -- --runTestsByPath src/rent-receivables/rent-allocation.spec.ts`

Expected: PASS，且每笔付款满足 `付款金额 = 分配金额 + 未分配金额`。

- [ ] **Step 5: 提交**

```bash
git add backend/src/rent-receivables/rent-allocation.ts backend/src/rent-receivables/rent-allocation.spec.ts
git commit -m "feat: 增加房租付款顺序分配"
```

---

### Task 3: 实体与历史数据迁移

**Files:**
- Create: `backend/src/rent-receivables/rent-receivable-schedule.entity.ts`
- Create: `backend/src/rent-receivables/rent-payment-allocation.entity.ts`
- Create: `backend/src/database/migrations/1712600000000-add-rent-receivable-schedules.ts`
- Create: `backend/src/database/migrations/1712600000000-add-rent-receivable-schedules.spec.ts`
- Modify: `backend/src/contracts/contract.entity.ts`
- Modify: `backend/src/rent-payments/rent-payment.entity.ts`
- Modify: `backend/src/database/entities.ts`
- Modify: `backend/src/database/typeorm.config.ts`
- Modify: `backend/src/contracts/contract-document.spec.ts`

**Interfaces:**
- Produces: `RentReceivableSchedule` 及 `RentPaymentAllocation` TypeORM relations。
- Produces: 合同字段 `billingFrequency`、`depositSettlementMode`、`depositCarryoverAmount`、`depositCarryoverSourceContractId`。
- Database invariant: `UNIQUE(contractId, sequence)`、`UNIQUE(rentPaymentId, rentReceivableScheduleId)`。

- [ ] **Step 1: 写实体元数据和迁移失败测试**

```ts
it("backfills annual schedules and interval-overlap payment allocations", async () => {
  const queryRunner = { query: jest.fn().mockResolvedValue(undefined) } as unknown as QueryRunner;
  await new AddRentReceivableSchedules1712600000000().up(queryRunner);
  const sql = (queryRunner.query as jest.Mock).mock.calls.flat().join("\n");
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS "rent_receivable_schedules"');
  expect(sql).toContain('UQ_rent_receivable_schedules_contract_sequence');
  expect(sql).toContain("generate_series");
  expect(sql).toContain('"deletedAt" IS NULL');
  expect(sql).toContain("LEAST(payment_end_cents, schedule_end_cents)");
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS "rent_payment_allocations"');
  expect(sql).toContain('"depositSettlementMode" = \'carryover\'');
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && npm test -- --runTestsByPath src/database/migrations/1712600000000-add-rent-receivable-schedules.spec.ts src/contracts/contract-document.spec.ts`

Expected: FAIL，迁移、枚举字段或实体关系不存在。

- [ ] **Step 3: 创建实体与合同字段**

```ts
@Entity("rent_receivable_schedules")
@Index("UQ_rent_receivable_schedules_contract_sequence", ["contractId", "sequence"], { unique: true })
export class RentReceivableSchedule extends BaseEntityWithTimestamps {
  @Column({ type: "uuid" }) contractId!: string;
  @ManyToOne(() => Contract, (contract) => contract.rentReceivableSchedules, { onDelete: "CASCADE" })
  @JoinColumn({ name: "contractId" }) contract!: Contract;
  @Column({ type: "integer" }) sequence!: number;
  @Column({ type: "date" }) periodStart!: string;
  @Column({ type: "date" }) periodEnd!: string;
  @Column({ type: "date" }) dueDate!: string;
  @Column({ type: "numeric", precision: 14, scale: 2, transformer: numericTransformer })
  receivableAmount!: number;
  @OneToMany(() => RentPaymentAllocation, (allocation) => allocation.schedule)
  allocations!: RentPaymentAllocation[];
}
```

```ts
@Entity("rent_payment_allocations")
@Index("UQ_rent_payment_allocations_payment_schedule", ["rentPaymentId", "rentReceivableScheduleId"], { unique: true })
export class RentPaymentAllocation extends BaseEntityWithTimestamps {
  @Column({ type: "uuid" }) rentPaymentId!: string;
  @ManyToOne(() => RentPayment, (payment) => payment.allocations, { onDelete: "CASCADE" })
  @JoinColumn({ name: "rentPaymentId" }) payment!: RentPayment;
  @Column({ type: "uuid" }) rentReceivableScheduleId!: string;
  @ManyToOne(() => RentReceivableSchedule, (schedule) => schedule.allocations, { onDelete: "CASCADE" })
  @JoinColumn({ name: "rentReceivableScheduleId" }) schedule!: RentReceivableSchedule;
  @Column({ type: "numeric", precision: 14, scale: 2, transformer: numericTransformer })
  allocatedAmount!: number;
}
```

- [ ] **Step 4: 实现幂等迁移和历史回填**

迁移依赖 TypeORM 默认的整次 migration 事务，并按顺序执行：增加合同列和检查约束；创建两张表、唯一约束、外键和索引；为所有未删除历史合同按年回填完整计划；对未删除付款使用累计金额区间交集回填分配；最后只对“开始日前已有其他旧合同未退押金”的合同推断结转。任一 SQL 失败时整次回滚。

```sql
INSERT INTO "rent_receivable_schedules"
  ("contractId", "sequence", "periodStart", "periodEnd", "dueDate", "receivableAmount")
SELECT c.id, series.index + 1,
  (c."startDate" + make_interval(years => series.index))::date,
  LEAST(c."endDate", (c."startDate" + make_interval(years => series.index + 1) - interval '1 day')::date),
  (c."startDate" + make_interval(years => series.index))::date,
  c."annualRent"
FROM contracts c
CROSS JOIN LATERAL generate_series(
  0,
  GREATEST(0, EXTRACT(YEAR FROM age(c."endDate", c."startDate"))::integer + 1)
) AS series(index)
WHERE c."deletedAt" IS NULL
  AND (c."startDate" + make_interval(years => series.index))::date <= c."endDate"
ON CONFLICT ("contractId", "sequence") DO NOTHING;
```

```sql
WITH ordered_schedules AS (
  SELECT id, "contractId",
    COALESCE(SUM(ROUND("receivableAmount" * 100)::bigint) OVER (
      PARTITION BY "contractId" ORDER BY "dueDate", sequence ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0) AS schedule_start_cents,
    SUM(ROUND("receivableAmount" * 100)::bigint) OVER (
      PARTITION BY "contractId" ORDER BY "dueDate", sequence
    ) AS schedule_end_cents
  FROM rent_receivable_schedules WHERE "deletedAt" IS NULL
), ordered_payments AS (
  SELECT id, "contractId",
    COALESCE(SUM(ROUND(amount * 100)::bigint) OVER (
      PARTITION BY "contractId" ORDER BY "paymentDate", id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0) AS payment_start_cents,
    SUM(ROUND(amount * 100)::bigint) OVER (
      PARTITION BY "contractId" ORDER BY "paymentDate", id
    ) AS payment_end_cents
  FROM rent_payments WHERE "deletedAt" IS NULL
)
INSERT INTO rent_payment_allocations
  ("rentPaymentId", "rentReceivableScheduleId", "allocatedAmount")
SELECT p.id, s.id,
  (LEAST(payment_end_cents, schedule_end_cents) - GREATEST(payment_start_cents, schedule_start_cents)) / 100.0
FROM ordered_payments p
JOIN ordered_schedules s ON s."contractId" = p."contractId"
WHERE LEAST(payment_end_cents, schedule_end_cents) > GREATEST(payment_start_cents, schedule_start_cents)
ON CONFLICT ("rentPaymentId", "rentReceivableScheduleId") DO NOTHING;
```

历史押金推断只统计当前合同开始日前、同房源同租户的旧合同流水；当前合同自己的首次押金不能反向把自己标为结转。结转快照保存当时全部可核实持有额，以便约定押金降低时 PDF 能稳定写出应退差额。

```sql
WITH carryover_candidates AS (
  SELECT current_contract.id,
    source_contract.id AS source_contract_id,
    COALESCE(balance.held_amount, 0) AS held_amount
  FROM contracts current_contract
  LEFT JOIN LATERAL (
    SELECT prior_contract.id
    FROM contracts prior_contract
    WHERE prior_contract."deletedAt" IS NULL
      AND prior_contract."unitId" = current_contract."unitId"
      AND btrim(prior_contract."tenantName") = btrim(current_contract."tenantName")
      AND prior_contract."startDate" < current_contract."startDate"
    ORDER BY prior_contract."startDate" DESC, prior_contract.id DESC
    LIMIT 1
  ) source_contract ON true
  LEFT JOIN LATERAL (
    SELECT SUM(CASE WHEN deposit.type = 'received' THEN deposit.amount ELSE -deposit.amount END) AS held_amount
    FROM deposit_records deposit
    JOIN contracts deposit_contract ON deposit_contract.id = deposit."contractId"
    WHERE deposit."deletedAt" IS NULL
      AND deposit_contract."deletedAt" IS NULL
      AND deposit_contract."unitId" = current_contract."unitId"
      AND btrim(deposit."tenantNameSnapshot") = btrim(current_contract."tenantName")
      AND deposit_contract."startDate" < current_contract."startDate"
      AND deposit."paymentDate" <= current_contract."startDate"
  ) balance ON true
  WHERE current_contract."deletedAt" IS NULL
    AND btrim(current_contract."tenantName") <> ''
)
UPDATE contracts contract
SET "depositSettlementMode" = 'carryover',
    "depositCarryoverAmount" = ROUND(candidate.held_amount, 2),
    "depositCarryoverSourceContractId" = candidate.source_contract_id
FROM carryover_candidates candidate
WHERE contract.id = candidate.id
  AND candidate.source_contract_id IS NOT NULL
  AND candidate.held_amount > 0;
```

迁移 `down` 必须先删分配表、再删计划表，最后删除合同新增列和检查约束；不得删除历史付款、押金或附件。

- [ ] **Step 5: 注册实体和迁移并运行测试、构建**

Run: `cd backend && npm test -- --runTestsByPath src/database/migrations/1712600000000-add-rent-receivable-schedules.spec.ts src/contracts/contract-document.spec.ts && npm run build`

Expected: PASS；TypeORM 能解析双向 relation，迁移 SQL 含软删除过滤和金额区间分配。

- [ ] **Step 6: 提交**

```bash
git add backend/src/rent-receivables/rent-receivable-schedule.entity.ts backend/src/rent-receivables/rent-payment-allocation.entity.ts backend/src/database/migrations/1712600000000-add-rent-receivable-schedules.ts backend/src/database/migrations/1712600000000-add-rent-receivable-schedules.spec.ts backend/src/contracts/contract.entity.ts backend/src/rent-payments/rent-payment.entity.ts backend/src/database/entities.ts backend/src/database/typeorm.config.ts backend/src/contracts/contract-document.spec.ts
git commit -m "feat: 持久化租金应收计划与付款分配"
```

---

### Task 4: 应收计划服务与 API

**Files:**
- Create: `backend/src/rent-receivables/rent-receivables.dto.ts`
- Create: `backend/src/rent-receivables/rent-receivables.service.ts`
- Create: `backend/src/rent-receivables/rent-receivables.service.spec.ts`
- Create: `backend/src/rent-receivables/rent-receivables.controller.ts`
- Create: `backend/src/rent-receivables/rent-receivables.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Produces: `syncContractSchedules(manager: EntityManager, contract: Contract): Promise<void>`。
- Produces: `rebuildPaymentAllocations(manager: EntityManager, contractId: string): Promise<RentAllocationResult>`。
- Produces: `getContractSummaries(contractIds: string[], asOfDate?: string): Promise<Map<string, RentContractFinancialSummary>>`。
- Produces: `GET /api/rent-receivables`、`GET /api/rent-receivables/:id`、`PATCH /api/rent-receivables/:id`。

- [ ] **Step 1: 写状态、查询和历史保护失败测试**

```ts
it("keeps due or allocated schedules and replaces only unprotected future schedules", async () => {
  schedulesRepository.find.mockResolvedValue([
    schedule({ id: "due", sequence: 1, dueDate: "2025-09-01", allocations: [] }),
    schedule({ id: "paid-future", sequence: 2, dueDate: "2027-09-01", allocations: [{ allocatedAmount: 1000 }] }),
    schedule({ id: "free-future", sequence: 3, dueDate: "2028-09-01", allocations: [] }),
  ]);
  await service.syncContractSchedules(manager, changedContract);
  expect(schedulesRepository.delete).toHaveBeenCalledWith({ id: In(["free-future"]) });
  expect(schedulesRepository.delete).not.toHaveBeenCalledWith({ id: In(["due", "paid-future"]) });
});

it("derives future payments as prepayment without adding them to due receivable", async () => {
  const result = await service.list({ contractId: "contract-1" });
  expect(result.items[0]).toMatchObject({ status: "prepaid", outstandingAmount: 0, prepaidAmount: 90000 });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && npm test -- --runTestsByPath src/rent-receivables/rent-receivables.service.spec.ts`

Expected: FAIL，服务和 DTO 尚不存在。

- [ ] **Step 3: 实现 DTO、状态和序列化结构**

```ts
export enum RentReceivableStatus {
  NOT_DUE = "not-due",
  PARTIALLY_PREPAID = "partially-prepaid",
  PREPAID = "prepaid",
  OVERDUE = "overdue",
  SETTLED = "settled",
}

export type RentContractFinancialSummary = {
  dueReceivableAmount: number;
  duePaidAmount: number;
  outstandingAmount: number;
  prepaidAmount: number;
  unallocatedAmount: number;
};
```

`ListRentReceivablesQueryDto` 使用 `@IsOptional()`、`@IsUUID()`、`@IsInt()`、`@Min(2000)`、`@IsEnum(RentReceivableStatus)` 校验 `unitId`、`contractId`、`tenantName`、`year`、`status`。`UpdateRentReceivableDto` 只允许 `dueDate`、`receivableAmount`，金额最小 `0.01`；租赁期间边界只能通过合同修改并由计划同步规则统一处理。

- [ ] **Step 4: 实现计划同步和分配重建**

`syncContractSchedules` 使用传入的事务 `EntityManager`。保护集合为 `dueDate <= formatShanghaiDate()` 或存在有效 allocation 的计划；新生成计划必须覆盖每个保护 sequence 且日期完全一致，否则抛出“合同修改会改变已到期或已收款期次，请先核对合同日期和收租周期”。未保护计划先删除再按生成结果补齐，随后调用 `rebuildPaymentAllocations`。

所有列表和详情查询都必须关联未删除合同，不能让已软删除合同的计划重新出现在收费或对账页面。

```ts
async rebuildPaymentAllocations(manager: EntityManager, contractId: string) {
  const schedules = await manager.getRepository(RentReceivableSchedule).find({
    where: { contractId }, order: { dueDate: "ASC", sequence: "ASC" },
  });
  const payments = await manager.getRepository(RentPayment).find({
    where: { contractId }, order: { paymentDate: "ASC", id: "ASC" },
  });
  const result = allocateRentPayments(schedules, payments);
  await manager.getRepository(RentPaymentAllocation).delete({
    rentReceivableScheduleId: In(schedules.map((item) => item.id)),
  });
  if (result.allocations.length) {
    await manager.getRepository(RentPaymentAllocation).save(result.allocations);
  }
  return result;
}
```

- [ ] **Step 5: 实现计划修改保护和 API**

`PATCH` 拒绝到期计划、已有分配计划、结束早于开始、金额不大于 0 或金额低于已分配；保存后在同一事务内重建合同全部分配。Controller 固定路由在 `:id` 路由之前声明，并统一使用 `JwtAuthGuard`。

- [ ] **Step 6: 运行模块测试和构建**

Run: `cd backend && npm test -- --runTestsByPath src/rent-receivables/rent-receivables.service.spec.ts && npm run build`

Expected: PASS；未来未付款计划可改，到期或已分配计划返回中文 `BadRequestException`。

- [ ] **Step 7: 提交**

```bash
git add backend/src/rent-receivables/rent-receivables.dto.ts backend/src/rent-receivables/rent-receivables.service.ts backend/src/rent-receivables/rent-receivables.service.spec.ts backend/src/rent-receivables/rent-receivables.controller.ts backend/src/rent-receivables/rent-receivables.module.ts backend/src/app.module.ts
git commit -m "feat: 提供应收计划查询与维护接口"
```

---

### Task 5: 押金账户汇总与结转来源

**Files:**
- Modify: `backend/src/deposits/deposits.dto.ts`
- Modify: `backend/src/deposits/deposits.service.ts`
- Modify: `backend/src/deposits/deposits.service.spec.ts`
- Modify: `backend/src/deposits/deposits.controller.ts`
- Modify: `backend/src/deposits/deposits.module.ts`

**Interfaces:**
- Produces: `normalizeDepositTenantName(value: string): string`。
- Produces: `listAccounts(query: ListDepositAccountsQueryDto): Promise<DepositAccountSummary[]>`。
- Produces: `getAccount(unitId: string, tenantName: string, sourceContractId?: string): Promise<DepositAccountSummary | null>`。
- Produces: `GET /api/deposits/accounts?unitId=&tenantName=`。

- [ ] **Step 1: 写账户聚合失败测试**

```ts
it("groups active deposit flows by unit and trimmed exact tenant name", async () => {
  depositsRepository.find.mockResolvedValue([
    deposit({ tenantNameSnapshot: " 大理石 ", type: "received", amount: 15000, paymentDate: "2025-09-01" }),
    deposit({ tenantNameSnapshot: "大理石", type: "refunded", amount: 3000, paymentDate: "2026-08-01" }),
    deposit({ tenantNameSnapshot: "大理石公司", type: "received", amount: 5000, paymentDate: "2026-08-02" }),
  ]);
  const accounts = await service.listAccounts({ unitId: "unit-1" });
  expect(accounts).toEqual(expect.arrayContaining([
    expect.objectContaining({ tenantName: "大理石", heldAmount: 12000 }),
    expect.objectContaining({ tenantName: "大理石公司", heldAmount: 5000 }),
  ]));
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && npm test -- --runTestsByPath src/deposits/deposits.service.spec.ts`

Expected: FAIL，账户查询方法不存在。

- [ ] **Step 3: 实现账户响应与来源合同校验**

```ts
export type DepositAccountSummary = {
  unitId: string;
  unit: { id: string; code: string; location: string };
  tenantName: string;
  agreedDepositAmount: number;
  heldAmount: number;
  supplementAmount: number;
  refundAmount: number;
  latestContractId: string | null;
  lastTransactionDate: string | null;
};
```

账户以有效 `DepositRecord` 为账本，收取加、退还减；约定押金取同组开始日最新的未删除合同。显式 `sourceContractId` 必须属于同一房源，随后按来源合同租户名称查询余额；空租户不自动返回结转账户。

```ts
const supplementCents = Math.max(toCents(agreedDepositAmount) - heldCents, 0);
const refundCents = Math.max(heldCents - toCents(agreedDepositAmount), 0);
```

- [ ] **Step 4: 注册静态路由并保留原流水 API**

`@Get("accounts")` 必须写在 `@Get(":id")` 之前。`DepositsModule` 导出 `DepositsService`，供合同服务校验结转快照；原收取、退还、凭证和软删除逻辑保持不变。

- [ ] **Step 5: 运行测试和构建**

Run: `cd backend && npm test -- --runTestsByPath src/deposits/deposits.service.spec.ts && npm run build`

Expected: PASS；退款超过收取时余额允许显示负数以暴露数据问题，但可结转金额不得小于 0。

- [ ] **Step 6: 提交**

```bash
git add backend/src/deposits/deposits.dto.ts backend/src/deposits/deposits.service.ts backend/src/deposits/deposits.service.spec.ts backend/src/deposits/deposits.controller.ts backend/src/deposits/deposits.module.ts
git commit -m "feat: 增加押金账户与续租结转查询"
```

---

### Task 6: 合同事务、周期和押金快照

**Files:**
- Modify: `backend/src/contracts/contracts.dto.ts`
- Modify: `backend/src/contracts/contracts.dto.spec.ts`
- Modify: `backend/src/contracts/contracts.service.ts`
- Modify: `backend/src/contracts/contracts.service.spec.ts`
- Modify: `backend/src/contracts/contracts.module.ts`

**Interfaces:**
- Consumes: `RentReceivablesService.syncContractSchedules`。
- Consumes: `DepositsService.getAccount`。
- Produces: 创建/修改合同与计划的原子事务。

- [ ] **Step 1: 写 DTO、事务和结转失败测试**

```ts
it("saves a contract and generated schedules in one transaction", async () => {
  await service.create(buildDto({ billingFrequency: "semiannual" }) as never);
  expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  expect(receivablesService.syncContractSchedules).toHaveBeenCalledWith(manager, expect.objectContaining({
    billingFrequency: BillingFrequency.SEMIANNUAL,
  }));
});

it("rejects carryover above the selected deposit account balance", async () => {
  depositsService.getAccount.mockResolvedValue({ heldAmount: 10000 });
  await expect(service.create(buildDto({
    depositSettlementMode: "carryover",
    depositCarryoverAmount: 12000,
  }) as never)).rejects.toThrow("结转押金不能超过当前持有押金");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && npm test -- --runTestsByPath src/contracts/contracts.dto.spec.ts src/contracts/contracts.service.spec.ts`

Expected: FAIL，新增字段未校验且合同未使用事务。

- [ ] **Step 3: 增加 DTO 校验**

```ts
@IsEnum(BillingFrequency)
@IsOptional()
billingFrequency?: BillingFrequency;

@IsEnum(DepositSettlementMode)
@IsOptional()
depositSettlementMode?: DepositSettlementMode;

@IsNumber()
@Min(0)
@IsOptional()
depositCarryoverAmount?: number;

@IsUUID()
@IsOptional()
depositCarryoverSourceContractId?: string;
```

同时把 `annualRent` 改为 `@Min(0.01)`，`depositAmount` 保持 `@Min(0)`。

- [ ] **Step 4: 在事务内保存合同并同步计划**

```ts
return this.dataSource.transaction(async (manager) => {
  const repository = manager.getRepository(Contract);
  const saved = await repository.save(repository.create(contractValues));
  await this.rentReceivablesService.syncContractSchedules(manager, saved);
  return repository.findOneOrFail({ where: { id: saved.id } });
});
```

`initial` 强制保存结转金额 `0`、来源 `null`。`carryover` 必须找到同房源账户，并满足 `0 <= depositCarryoverAmount <= max(heldAmount, 0)`；未传金额时取完整 `heldAmount` 快照。约定押金高于快照时显示需补，低于快照时显示应退。修改合同使用相同规则，并由 `syncContractSchedules` 保护历史计划。

编辑已有合同时，如果结转方式、金额和来源都未变化，只保留原快照，不使用下载或编辑当天的余额重新校验；只有人工改变这三个字段时才查询当前账户并校验。增加回归测试：押金已在后续退还的历史合同仍可只修改联系人，保存后原结转文字不变。

创建合同未显式传 `billingFrequency` 时默认 `annual`；未显式传押金处理方式时，后端也要查询同房源同租户账户，有余额则默认 `carryover` 并保存完整余额及 `latestContractId`，否则默认 `initial`。更新接口缺少这些新字段时保留数据库现值，兼容仍缓存 `V0.5.0` 的浏览器页面，不能把旧结转快照重置。

- [ ] **Step 5: 运行合同及计划测试**

Run: `cd backend && npm test -- --runTestsByPath src/contracts/contracts.dto.spec.ts src/contracts/contracts.service.spec.ts src/rent-receivables/rent-receivables.service.spec.ts`

Expected: PASS；事务中任一步抛错时合同 save 不提交。

- [ ] **Step 6: 提交**

```bash
git add backend/src/contracts/contracts.dto.ts backend/src/contracts/contracts.dto.spec.ts backend/src/contracts/contracts.service.ts backend/src/contracts/contracts.service.spec.ts backend/src/contracts/contracts.module.ts
git commit -m "feat: 合同保存时生成应收并记录押金结转"
```

---

### Task 7: 收款事务、分配重建和预览

**Files:**
- Modify: `backend/src/rent-payments/rent-payments.dto.ts`
- Modify: `backend/src/rent-payments/rent-payments.service.ts`
- Modify: `backend/src/rent-payments/rent-payments.service.spec.ts`
- Modify: `backend/src/rent-payments/rent-payments.controller.ts`
- Modify: `backend/src/rent-payments/rent-payments.module.ts`

**Interfaces:**
- Produces: `POST /api/rent-payments/allocation-preview`。
- Produces: `previewAllocation(dto: PreviewRentPaymentAllocationDto): Promise<RentPaymentAllocationPreview>`。
- Changes: create/update/remove 返回 `{ payment, allocations, unallocatedAmount }`，同时保持 `payment` 完整关联数据。

- [ ] **Step 1: 写事务重建和预览失败测试**

```ts
it("rebuilds all allocations in the same transaction after saving", async () => {
  const result = await service.create(createDto as never);
  expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  expect(receivablesService.rebuildPaymentAllocations).toHaveBeenCalledWith(manager, "contract-1");
  expect(result).toMatchObject({ payment: { id: "payment-1" }, unallocatedAmount: 0 });
});

it("previews an edited payment after excluding its old amount", async () => {
  await service.previewAllocation({
    contractId: "contract-1", paymentDate: "2026-09-01", amount: 100000, excludePaymentId: "payment-1",
  });
  expect(allocatorInput.payments).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "payment-1" })]));
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && npm test -- --runTestsByPath src/rent-payments/rent-payments.service.spec.ts`

Expected: FAIL，服务尚未注入 `DataSource` 和应收服务。

- [ ] **Step 3: 实现 DTO 和预览**

`CreateRentPaymentDto.amount` 改为 `@Min(0.01)`。`PreviewRentPaymentAllocationDto` 复用 `contractId`、`paymentDate`、`amount`，可选 `excludePaymentId`；预览将旧付款移除，插入 ID 为 `~preview` 的临时付款，返回临时付款的逐期分配和未分配金额，不写数据库。

```ts
export type RentPaymentAllocationPreview = {
  allocations: Array<{
    scheduleId: string;
    sequence: number;
    periodStart: string;
    periodEnd: string;
    allocatedAmount: number;
  }>;
  unallocatedAmount: number;
};
```

新增/修改接口的前端返回类型同步改为 `RentPaymentMutationResult = { payment: RentPayment; allocations: RentPaymentAllocationPreview["allocations"]; unallocatedAmount: number }`，列表接口仍返回原始 `RentPayment[]`。

- [ ] **Step 4: 将新增、修改、删除改为事务**

文件解析可在事务前完成；付款实体保存/软删除、有效收据检查和 `rebuildPaymentAllocations` 必须使用同一个 `EntityManager`。已有有效收据时继续拒绝修改或删除，失败时不留下半套分配。

- [ ] **Step 5: 注册静态预览路由并运行测试**

`@Post("allocation-preview")` 写在 `@Get(":id")` 之前。

Run: `cd backend && npm test -- --runTestsByPath src/rent-payments/rent-payments.service.spec.ts src/rent-receivables/rent-allocation.spec.ts && npm run build`

Expected: PASS；删除付款后较晚付款自动前移填补最早欠费。

- [ ] **Step 6: 提交**

```bash
git add backend/src/rent-payments/rent-payments.dto.ts backend/src/rent-payments/rent-payments.service.ts backend/src/rent-payments/rent-payments.service.spec.ts backend/src/rent-payments/rent-payments.controller.ts backend/src/rent-payments/rent-payments.module.ts
git commit -m "feat: 房租收款自动重建期次分配"
```

---

### Task 8: 厂房与合同财务汇总

**Files:**
- Modify: `backend/src/units/units.service.ts`
- Modify: `backend/src/units/units.service.spec.ts`
- Modify: `backend/src/units/units.module.ts`
- Modify: `backend/src/contracts/contract-rent-schedule.ts` (remove)
- Modify: `backend/src/contracts/contract-rent-schedule.spec.ts` (remove)

**Interfaces:**
- Consumes: `RentReceivablesService.getContractSummaries`。
- Changes Contract response: `dueReceivableAmount`、`duePaidAmount`、`outstandingAmount`、`prepaidAmount`、`unallocatedAmount`。
- Preserves: `annualRent`、`depositAmount`、附件、甲乙方字段和合同状态。

- [ ] **Step 1: 写多年合同未来期次失败测试**

```ts
it("serializes only matured schedules as current receivable", async () => {
  summaries.set("contract-1", {
    dueReceivableAmount: 180000,
    duePaidAmount: 100000,
    outstandingAmount: 80000,
    prepaidAmount: 0,
    unallocatedAmount: 0,
  });
  const [unit] = await service.list();
  expect(unit.contracts[0]).toMatchObject({
    dueReceivableAmount: 180000,
    outstandingAmount: 80000,
  });
  expect(unit.contracts[0]).not.toHaveProperty("receivableAmount");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && npm test -- --runTestsByPath src/units/units.service.spec.ts`

Expected: FAIL，服务仍调用临时 `calculateAccruedReceivable`。

- [ ] **Step 3: 批量加载合同汇总并序列化新字段**

`UnitsService.list/getDetail` 先收集所有合同 ID，一次调用 `getContractSummaries`，再传入 `serializeContract`。`activeContract` 与历史合同使用相同汇总对象，厂房“合计欠费”继续由前端累计各合同 `outstandingAmount`。

```ts
private serializeContract(contract: Contract, summary: RentContractFinancialSummary) {
  return {
    ...partyAndContractFields,
    billingFrequency: contract.billingFrequency,
    depositSettlementMode: contract.depositSettlementMode,
    depositCarryoverAmount: contract.depositCarryoverAmount,
    depositCarryoverSourceContractId: contract.depositCarryoverSourceContractId,
    ...summary,
  };
}
```

- [ ] **Step 4: 删除旧临时应收 helper 并运行回归**

Run: `cd backend && npm test -- --runTestsByPath src/units/units.service.spec.ts src/rent-receivables/rent-schedule.spec.ts && npm run build`

Expected: PASS；代码库不再引用 `buildAccruedRentPeriods` 或 `calculateAccruedReceivable`。

- [ ] **Step 5: 提交**

```bash
git add backend/src/units/units.service.ts backend/src/units/units.service.spec.ts backend/src/units/units.module.ts backend/src/contracts/contract-rent-schedule.ts backend/src/contracts/contract-rent-schedule.spec.ts
git commit -m "refactor: 厂房合同汇总改用保存的应收计划"
```

---

### Task 9: 对账服务与 PDF 统一口径

**Files:**
- Modify: `backend/src/rent-reconciliation/rent-reconciliation.types.ts`
- Modify: `backend/src/rent-reconciliation/rent-reconciliation.service.ts`
- Modify: `backend/src/rent-reconciliation/rent-reconciliation.service.spec.ts`
- Modify: `backend/src/rent-reconciliation/rent-reconciliation.module.ts`
- Modify: `backend/src/rent-reconciliation/rent-reconciliation.document.ts`
- Modify: `backend/src/rent-reconciliation/rent-reconciliation.document.spec.ts`
- Modify: `backend/src/rent-reconciliation/rent-reconciliation.document-layout.spec.ts`

**Interfaces:**
- Consumes: 保存的 `RentReceivableSchedule.allocations.payment`。
- Changes period response: `scheduleId`、`sequence`、`dueDate`、`status`、`prepaidAmount`。
- Changes summary response: `dueReceivableAmount`、`duePaidAmount`、`outstandingAmount`、`prepaidAmount`、`unallocatedAmount`。
- Changes summary status: `outstanding | settled | prepaid | credit`。

- [ ] **Step 1: 写保存计划口径失败测试**

```ts
it("uses saved schedules, keeps future periods out of current debt, and exposes prepayment", async () => {
  schedulesRepository.find.mockResolvedValue([
    savedSchedule({ dueDate: "2025-09-01", receivableAmount: 90000, allocatedAmount: 90000 }),
    savedSchedule({ dueDate: "2026-09-01", receivableAmount: 90000, allocatedAmount: 10000 }),
  ]);
  const detail = await service.detail({ tenantName: "大理石" });
  expect(detail).toMatchObject({
    dueReceivableAmount: 90000,
    duePaidAmount: 90000,
    outstandingAmount: 0,
    prepaidAmount: 10000,
  });
  expect(detail.periods[1].status).toBe("partially-prepaid");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && npm test -- --runTestsByPath src/rent-reconciliation/rent-reconciliation.service.spec.ts src/rent-reconciliation/rent-reconciliation.document.spec.ts src/rent-reconciliation/rent-reconciliation.document-layout.spec.ts`

Expected: FAIL，对账仍临时拆合同且把超额款挂在最后一期。

- [ ] **Step 3: 改为读取计划和真实 allocation**

每期 `paidAmount` 只汇总该期 allocation；付款行金额使用 `allocatedAmount`，但凭证、备注、方式和收据继续来自原 `RentPayment`。未分配结余按租户所有有效付款减全部分配计算，不挂到最后一期。年度筛选按 `periodStart` 年份，`availableYears` 从保存计划提取。

```ts
const duePeriods = periods.filter((period) => period.dueDate <= asOfDate);
const dueReceivableCents = sumCents(duePeriods, "receivableAmount");
const duePaidCents = sumCents(duePeriods, "paidAmount");
const prepaidCents = sumCents(
  periods.filter((period) => period.dueDate > asOfDate),
  "paidAmount",
);
```

总账状态优先级固定为：当前结欠大于 0 为 `outstanding`；否则未分配结余大于 0 为 `credit`；否则未来预收大于 0 为 `prepaid`；其余为 `settled`。后端年度和状态筛选使用该派生结果。

- [ ] **Step 4: 更新 PDF 字段和红色结欠规则**

PDF 顶部继续不显示累计应收、累计实收；保留“当前结欠”“预收”“未分配结余”。未到期计划明确显示“未到期/部分预收/已预收”，不得显示为欠费。`outstandingAmount !== 0` 时“结欠”文字和金额继续使用红色。

- [ ] **Step 5: 运行对账和 PDF 测试**

Run: `cd backend && npm test -- --runTestsByPath src/rent-reconciliation/rent-reconciliation.service.spec.ts src/rent-reconciliation/rent-reconciliation.document.spec.ts src/rent-reconciliation/rent-reconciliation.document-layout.spec.ts`

Expected: PASS；同一付款跨期时两期金额之和等于原付款被分配金额，PDF 页数不增加空白页。

- [ ] **Step 6: 提交**

```bash
git add backend/src/rent-reconciliation/rent-reconciliation.types.ts backend/src/rent-reconciliation/rent-reconciliation.service.ts backend/src/rent-reconciliation/rent-reconciliation.service.spec.ts backend/src/rent-reconciliation/rent-reconciliation.module.ts backend/src/rent-reconciliation/rent-reconciliation.document.ts backend/src/rent-reconciliation/rent-reconciliation.document.spec.ts backend/src/rent-reconciliation/rent-reconciliation.document-layout.spec.ts
git commit -m "refactor: 房租对账改用应收计划与分配"
```

---

### Task 10: 合同 PDF 区分首次押金和续租结转

**Files:**
- Modify: `backend/src/contracts/contract-document.ts`
- Modify: `backend/src/contracts/contract-document.spec.ts`

**Interfaces:**
- Consumes: `depositSettlementMode`、`depositCarryoverAmount`、`depositAmount`、`billingFrequency`。
- Produces: 稳定的签约快照文字，不读取下载当天押金流水。

- [ ] **Step 1: 写首次、全额结转、补差和应退失败测试**

```ts
it("describes an unchanged carried deposit without requesting a second payment", () => {
  const contract = buildContractFixture();
  contract.depositSettlementMode = DepositSettlementMode.CARRYOVER;
  contract.depositAmount = 10000;
  contract.depositCarryoverAmount = 10000;
  const text = buildStandardLeaseContractPages({ contract, unit, generatedDate }).flatMap((p) => p.sections).join("\n");
  expect(text).toContain("原已支付押金人民币10000.00元继续作为本合同履约保证金");
  expect(text).not.toContain("再次支付履约保证金");
});
```

另写 `depositAmount=15000/carryover=10000` 期望“尚需补足5000.00元”，以及 `depositAmount=10000/carryover=15000` 期望“应退还5000.00元”。两种差额都只读取合同保存的结转快照，不读取下载当天流水。

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && npm test -- --runTestsByPath src/contracts/contract-document.spec.ts`

Expected: FAIL，正文仍统一写“乙方应支付”。

- [ ] **Step 3: 实现周期和押金条款 builder**

```ts
function buildRentPaymentClause(contract: Contract) {
  return contract.billingFrequency === BillingFrequency.SEMIANNUAL
    ? `租金按半年支付，先付后用；每期租金应于该期开始日支付。`
    : `租金按年支付，先付后用；每期租金应于该租赁年度开始日支付。`;
}

function buildDepositClause(contract: Contract) {
  if (contract.depositSettlementMode === DepositSettlementMode.CARRYOVER) {
    const agreedCents = toCents(contract.depositAmount);
    const carriedCents = toCents(contract.depositCarryoverAmount);
    if (carriedCents < agreedCents) {
      return `原已支付押金人民币${formatMoney(contract.depositCarryoverAmount)}元继续作为本合同履约保证金，乙方尚需补足人民币${formatMoney(fromCents(agreedCents - carriedCents))}元。`;
    }
    if (carriedCents > agreedCents) {
      return `原已支付押金人民币${formatMoney(contract.depositCarryoverAmount)}元，其中人民币${formatMoney(contract.depositAmount)}元继续作为本合同履约保证金，甲方应退还人民币${formatMoney(fromCents(carriedCents - agreedCents))}元。`;
    }
    return `原已支付押金人民币${formatMoney(contract.depositCarryoverAmount)}元继续作为本合同履约保证金。`;
  }
  return `乙方应向甲方支付履约保证金人民币${formatMoney(contract.depositAmount)}元。`;
}
```

- [ ] **Step 4: 运行完整合同 PDF 回归**

Run: `cd backend && npm test -- --runTestsByPath src/contracts/contract-document.spec.ts`

Expected: PASS；标准正文、安全协议、字体和签字栏像素测试不回归。

- [ ] **Step 5: 提交**

```bash
git add backend/src/contracts/contract-document.ts backend/src/contracts/contract-document.spec.ts
git commit -m "feat: 合同正文区分押金首次收取与结转"
```

---

### Task 11: 前端类型、API 与合同表单

**Files:**
- Modify: `frontend/src/generated/openapi.ts`
- Modify: `frontend/src/types/models.ts`
- Modify: `frontend/src/api/index.ts`
- Create: `frontend/src/utils/rent-schedule-preview.ts`
- Create: `frontend/src/utils/rent-schedule-preview.spec.ts`
- Modify: `frontend/src/views/UnitsView.vue`
- Modify: `frontend/src/views/UnitsView.contract-download.spec.ts`
- Modify: `frontend/src/styles/base.css`

**Interfaces:**
- Produces: `RentReceivable`、`RentPaymentAllocationPreview`、`DepositAccountSummary` 前端类型。
- Produces: `rentReceivablesApi.list/detail/update`、`depositsApi.listAccounts`、`rentPaymentsApi.previewAllocation`。
- Changes: 新增/编辑合同提交四个押金/周期字段。

- [ ] **Step 1: 写表单默认结转和期次预览失败测试**

```ts
it("defaults a same-tenant renewal to carried deposit and previews semiannual periods", async () => {
  vi.mocked(depositsApi.listAccounts).mockResolvedValue([
    { unitId: "unit-1", unit: unitRef, tenantName: "大理石", agreedDepositAmount: 10000, heldAmount: 10000,
      supplementAmount: 0, refundAmount: 0, latestContractId: "contract-old", lastTransactionDate: "2025-09-01" },
  ]);
  await openNewContract(wrapper);
  await wrapper.get('[aria-label="收租周期-按半年"]').trigger("click");
  expect(wrapper.text()).toContain("预计 6 期");
  expect(wrapper.get('[aria-label="押金处理方式"]').text()).toContain("沿用已有押金");
  await saveContract(wrapper);
  expect(contractsApi.create).toHaveBeenCalledWith(expect.objectContaining({
    billingFrequency: "semiannual",
    depositSettlementMode: "carryover",
    depositCarryoverAmount: 10000,
    depositCarryoverSourceContractId: "contract-old",
  }));
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd frontend && npm test -- src/utils/rent-schedule-preview.spec.ts src/views/UnitsView.contract-download.spec.ts`

Expected: FAIL，新类型、API 和控件不存在。

- [ ] **Step 3: 增加类型和 API**

```ts
export type RentReceivable = {
  id: string;
  contractId: string;
  sequence: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  receivableAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  prepaidAmount: number;
  status: "not-due" | "partially-prepaid" | "prepaid" | "overdue" | "settled";
};
```

```ts
export const rentReceivablesApi = {
  list: (query: Record<string, string | number | undefined>) =>
    apiFetch<{ items: RentReceivable[] }>(`/rent-receivables${buildSearch(query)}`),
  detail: (id: string) => apiFetch<RentReceivable>(`/rent-receivables/${id}`),
  update: (id: string, payload: Record<string, unknown>) =>
    apiFetch<RentReceivable>(`/rent-receivables/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
};
```

- [ ] **Step 4: 实现合同周期与期次预览**

年租金旁使用 `el-radio-group` 分段显示“按年/按半年”。`buildRentSchedulePreview(startDate, endDate, frequency)` 返回 `{ count, firstDueDate }`，日期锚定规则与后端测试样例一致；只用于展示，不作为后端入账数据。

`UnitsView.vue` 中“新增厂房时一并录入初始合同”的 `unitContractForm` 和厂房详情里的 `contractForm` 必须同时增加收租周期和押金处理字段。初始合同固定默认 `annual + initial`；新增续租合同才查询已有押金账户。测试分别覆盖两个入口，避免只改详情弹窗。

- [ ] **Step 5: 实现押金处理区域**

选择同房源同租户且 `heldAmount > 0` 时默认 `carryover`，结转来源取账户 `latestContractId`，结转金额默认保存完整 `heldAmount` 快照；换租户或空租户默认 `initial`。界面显示“约定押金、当前持有、已结转、需补、应退”，允许人工切换首次收取及选择其他有余额账户的来源合同。

编辑历史合同时以已保存的 `depositSettlementMode/depositCarryoverAmount/depositCarryoverSourceContractId` 初始化，账户余额只用于旁边展示，不自动覆盖快照。只有新增合同或用户主动选择另一来源时才重算默认结转金额。

合同历史将“应收”改成“已到期应收”，增加收租周期、预收和“查看期次”按钮；期次弹窗调用 `rentReceivablesApi.list({ contractId })`。金额为 0 时也保持列宽稳定，移动端表格继续在容器内横向滚动。

- [ ] **Step 6: 运行表单、类型和构建回归**

Run: `cd frontend && npm test -- src/utils/rent-schedule-preview.spec.ts src/views/UnitsView.contract-download.spec.ts && npm run type-check && npm run build`

Expected: PASS；首次合同默认 `annual + initial`，续租同租户默认结转，手工切回首次收取后提交金额 0 和来源 null。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/generated/openapi.ts frontend/src/types/models.ts frontend/src/api/index.ts frontend/src/utils/rent-schedule-preview.ts frontend/src/utils/rent-schedule-preview.spec.ts frontend/src/views/UnitsView.vue frontend/src/views/UnitsView.contract-download.spec.ts frontend/src/styles/base.css
git commit -m "feat: 合同表单支持收租周期和押金结转"
```

---

### Task 12: 房租收费页增加应收计划和分配预览

**Files:**
- Modify: `frontend/src/views/RentPaymentsView.vue`
- Modify: `frontend/src/views/RentPaymentsView.voucher.spec.ts`
- Create: `frontend/src/views/RentPaymentsView.receivables.spec.ts`
- Modify: `frontend/src/styles/base.css`

**Interfaces:**
- Consumes: `rentReceivablesApi.list`、`rentPaymentsApi.previewAllocation`。
- Preserves: 凭证拖拽、凭证预览、收据开具/预览、编辑和删除。

- [ ] **Step 1: 写页签、登记收款和预览失败测试**

```ts
it("opens on receivables and registers the selected outstanding period", async () => {
  vi.mocked(rentReceivablesApi.list).mockResolvedValue({ items: [overdueSchedule] });
  const wrapper = mountView();
  await flushPromises();
  expect(wrapper.get('[data-test="receivables-tab"]').classes()).toContain("is-active");
  await wrapper.get('[data-test="register-schedule-payment"]').trigger("click");
  expect(wrapper.get('[aria-label="金额"]').attributes("model-value")).toBe(String(overdueSchedule.outstandingAmount));
});

it("shows how one payment will cross two periods before saving", async () => {
  vi.mocked(rentPaymentsApi.previewAllocation).mockResolvedValue({
    allocations: [previewAllocation("s1", 80000), previewAllocation("s2", 20000)],
    unallocatedAmount: 0,
  });
  await enterPayment(wrapper, 100000);
  expect(wrapper.text()).toContain("第 1 期");
  expect(wrapper.text()).toContain("¥80,000.00");
  expect(wrapper.text()).toContain("第 2 期");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd frontend && npm test -- src/views/RentPaymentsView.receivables.spec.ts src/views/RentPaymentsView.voucher.spec.ts`

Expected: FAIL，页面只有收款记录表。

- [ ] **Step 3: 增加两个页签和应收筛选**

默认页签“应收计划”，显示房源、租户、租赁期间、到期日、应收、实收、欠费/预收、状态和登记收款。筛选支持房源、租户、年度和状态；“收款记录”保留现有表格及收据筛选。

状态文案固定为：`not-due=未到期`、`partially-prepaid=部分预收`、`prepaid=已预收`、`overdue=欠费`、`settled=已结清`。欠费金额红色，未到期不显示红色。

租户筛选必须使用 `el-select` 下拉，选项来自应收计划中的唯一租户名称；不恢复自由文本搜索框。

- [ ] **Step 4: 接入登记收款和服务端分配预览**

点击计划行时预填对应合同和本期 `outstandingAmount`。付款日期、合同或金额变化后调用 `allocation-preview`，弹窗内逐期显示分配金额；超额部分明确显示“未分配结余”。保存成功后同时刷新计划、收款和收据。

```ts
async function refreshAllocationPreview() {
  if (!form.contractId || Number(form.amount) <= 0) {
    allocationPreview.value = null;
    return;
  }
  allocationPreview.value = await rentPaymentsApi.previewAllocation({
    contractId: form.contractId,
    paymentDate: form.paymentDate,
    amount: Number(form.amount),
    excludePaymentId: form.id || undefined,
  });
}
```

- [ ] **Step 5: 运行新旧房租页面测试和构建**

Run: `cd frontend && npm test -- src/views/RentPaymentsView.receivables.spec.ts src/views/RentPaymentsView.voucher.spec.ts && npm run type-check && npm run build`

Expected: PASS；原凭证测试仍证明先上传图片再保存付款，重复点击保存被 `submitting` 阻止。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/RentPaymentsView.vue frontend/src/views/RentPaymentsView.voucher.spec.ts frontend/src/views/RentPaymentsView.receivables.spec.ts frontend/src/styles/base.css
git commit -m "feat: 房租收费展示逐期应收和分配预览"
```

---

### Task 13: 押金账户页面与对账页面

**Files:**
- Modify: `frontend/src/views/DepositsView.vue`
- Modify: `frontend/src/views/DepositsView.voucher.spec.ts`
- Create: `frontend/src/views/DepositsView.accounts.spec.ts`
- Modify: `frontend/src/features/rent-reconciliation/types.ts`
- Modify: `frontend/src/features/rent-reconciliation/views/RentReconciliationView.vue`
- Modify: `frontend/src/features/rent-reconciliation/views/RentReconciliationView.spec.ts`
- Modify: `frontend/src/styles/base.css`

**Interfaces:**
- Consumes: `depositsApi.listAccounts` 与新版 reconciliation response。
- Preserves: 押金凭证拖拽/预览、对账收据与凭证预览、打印和 PDF 下载防重复。

- [ ] **Step 1: 写押金账户和未来期次失败测试**

```ts
it("shows one deposit account per unit and exact tenant", async () => {
  vi.mocked(depositsApi.listAccounts).mockResolvedValue([depositAccount]);
  const wrapper = mountDeposits();
  await flushPromises();
  expect(wrapper.text()).toContain("当前持有");
  expect(wrapper.text()).toContain("¥12,000.00");
  expect(wrapper.text()).toContain("需补");
});

it("shows a future schedule as prepaid without increasing current debt", async () => {
  vi.mocked(rentReconciliationApi.detail).mockResolvedValue(detailWithFuturePrepayment);
  await openTenant(wrapper, "大理石");
  expect(wrapper.text()).toContain("部分预收");
  expect(wrapper.get('[data-test="current-outstanding"]').text()).toContain("¥0.00");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd frontend && npm test -- src/views/DepositsView.accounts.spec.ts src/views/DepositsView.voucher.spec.ts src/features/rent-reconciliation/views/RentReconciliationView.spec.ts`

Expected: FAIL，押金页面没有账户汇总，对账类型没有预收字段。

- [ ] **Step 3: 增加押金账户汇总**

页面上方使用一张紧凑表格，一行显示厂房、租户、约定押金、当前持有、需补、应退、最近流水日期。需补和应退大于 0 时使用醒目但克制的红色；下方原收退流水保持不变。新增/编辑流水成功后同时刷新账户和流水。

- [ ] **Step 4: 更新 Web 对账字段和状态**

总账继续只展示当前结欠、当前结余，不恢复累计应收/累计实收。详情按保存计划显示到期日和状态；未来已付款显示预收，未分配金额独立显示，不并入最后一期。结欠非零的文字和金额继续使用 `amount-overdue`。

总账筛选增加“有预收”状态，对应后端 `prepaid`；状态显示优先级与 Task 9 保持一致。

- [ ] **Step 5: 运行页面回归和构建**

Run: `cd frontend && npm test -- src/views/DepositsView.accounts.spec.ts src/views/DepositsView.voucher.spec.ts src/features/rent-reconciliation/views/RentReconciliationView.spec.ts && npm run type-check && npm run build`

Expected: PASS；现有图片上传/预览和 PDF 重复点击保护全部保留。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/DepositsView.vue frontend/src/views/DepositsView.voucher.spec.ts frontend/src/views/DepositsView.accounts.spec.ts frontend/src/features/rent-reconciliation/types.ts frontend/src/features/rent-reconciliation/views/RentReconciliationView.vue frontend/src/features/rent-reconciliation/views/RentReconciliationView.spec.ts frontend/src/styles/base.css
git commit -m "feat: 展示押金账户和逐期房租对账"
```

---

### Task 14: 全量验证、发布 V0.6.0 与 DSM 部署

**Files:**
- Modify: `README.md`
- Modify: `docs/database-schema.md`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/src/config/app-meta.ts`

**Interfaces:**
- Produces: GitHub `main` 上的 `V0.6.0` 源码与 GHCR `latest` 前后端镜像。
- Deploys: DSM compose project `rent`，目录 `/volume4/docker/docker/rent`，compose 文件 `compose.yaml`。

- [ ] **Step 1: 更新版本和文档**

先分别运行 `cd backend && npm version 0.6.0 --no-git-tag-version` 与 `cd frontend && npm version 0.6.0 --no-git-tag-version`，同步更新 package 和 lock；前端再运行 `npm install --save-dev @vitest/coverage-v8@3.2.6`，让覆盖率检查与现有 Vitest 主版本一致。`APP_VERSION` 和 README 改为 `V0.6.0`，时间使用执行时的 Asia/Shanghai 时间。README 更新说明必须明确：多年合同按年/半年生成应收计划、未来不挂欠费、付款 FIFO 分配、续租押金结转一次、收费/押金/对账页面同步调整。`docs/database-schema.md` 增加两张表、关系、唯一约束和合同四个字段。

- [ ] **Step 2: 运行后端全量检查**

Run: `cd backend && npm test && npm run lint && npm run build`

Expected: 全部 PASS，无 TypeScript、ESLint 或 Jest 错误。

Run: `cd backend && npm test -- --coverage`

Expected: 本次新增公开纯函数和服务分支覆盖率不低于 80%，未覆盖行必须属于数据库驱动或 PDF 二进制边界且已有集成/布局测试。

- [ ] **Step 3: 运行前端全量检查**

Run: `cd frontend && npm test && npm run type-check && npm run build`

Expected: 全部 PASS，无 Vue 模板、类型或 Vitest 错误。

Run: `cd frontend && npm test -- --coverage`

Expected: 本次新增预览 helper 和页面关键分支覆盖率不低于 80%；若 Vitest 未安装 coverage provider，则保持全量测试通过并在部署总结中明确记录该限制，不临时引入无关依赖。

- [ ] **Step 4: 校验三套 compose 配置**

Run: `test -e .env && docker compose -f docker-compose.yml config >/dev/null || (cp .env.example .env && docker compose -f docker-compose.yml config >/dev/null && rm .env)`

Run: `docker compose -f docker-compose.ghcr.yml config >/dev/null`

Run: `WEB_UPDATE_PROJECT_DIR=/volume4/docker/docker/rent docker compose -f docker-compose.ghcr.yml -f docker-compose.web-update.yml config >/dev/null`

Expected: 三条命令退出码均为 0；验证后只删除本步骤新建且此前不存在的本地 `.env`。

- [ ] **Step 5: 提交发布文件并检查工作树**

```bash
git add README.md docs/database-schema.md backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json frontend/src/config/app-meta.ts
git commit -m "chore: 发布 V0.6.0"
git status --short --branch
```

Expected: 仅保留原有未跟踪 `.workflow/`，`main` 包含本计划列出的功能提交。

- [ ] **Step 6: 推送并等待 GitHub Actions**

```bash
git push origin main
ci_run_id="$(gh run list --workflow ci.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId')"
publish_run_id="$(gh run list --workflow docker-publish.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$ci_run_id" --exit-status
gh run watch "$publish_run_id" --exit-status
```

Expected: `CI` 和 `Publish Docker Images` 均成功，GHCR 的 backend/frontend `latest` 标签 revision 等于本次发布提交。

- [ ] **Step 7: 在 DSM 备份生产数据库**

```bash
ssh jarvis@192.168.0.153
cd /volume4/docker/docker/rent
mkdir -p backups
sudo docker exec factory-rental-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "backups/factory_rental_before_v0.6.0_$(date +%Y%m%d_%H%M%S).sql.gz"
ls -lh backups/factory_rental_before_v0.6.0_*.sql.gz | tail -n 1
```

Expected: 最新备份文件大小大于 0，且不修改 `volumes/postgres` 和 `volumes/storage`。

- [ ] **Step 8: 拉取镜像并重新部署**

```bash
cd /volume4/docker/docker/rent
sudo /var/packages/ContainerManager/target/usr/bin/docker compose -f compose.yaml pull backend frontend
sudo /var/packages/ContainerManager/target/usr/bin/docker compose -f compose.yaml up -d --remove-orphans
sudo /var/packages/ContainerManager/target/usr/bin/docker compose -f compose.yaml ps
```

Expected: `factory-rental-postgres`、`factory-rental-backend`、`factory-rental-frontend` 均为 running/healthy；后端启动日志显示 migration 成功。

- [ ] **Step 9: 核对迁移与金额守恒**

```bash
sudo docker exec factory-rental-postgres psql -U rent -d factory_rental -c 'SELECT COUNT(*) AS schedules FROM rent_receivable_schedules WHERE "deletedAt" IS NULL;'
sudo docker exec factory-rental-postgres psql -U rent -d factory_rental -c 'SELECT COUNT(*) AS allocations FROM rent_payment_allocations WHERE "deletedAt" IS NULL;'
sudo docker exec factory-rental-postgres psql -U rent -d factory_rental -c 'SELECT COUNT(*) AS overallocated FROM (SELECT p.id FROM rent_payments p LEFT JOIN rent_payment_allocations a ON a."rentPaymentId" = p.id AND a."deletedAt" IS NULL WHERE p."deletedAt" IS NULL GROUP BY p.id, p.amount HAVING COALESCE(SUM(a."allocatedAmount"), 0) > p.amount) x;'
sudo docker exec factory-rental-postgres psql -U rent -d factory_rental -c 'SELECT COUNT(*) AS duplicate_sequences FROM (SELECT "contractId", sequence FROM rent_receivable_schedules WHERE "deletedAt" IS NULL GROUP BY "contractId", sequence HAVING COUNT(*) > 1) x;'
```

Expected: `schedules > 0`；有历史付款时 `allocations > 0`；`overallocated = 0`；`duplicate_sequences = 0`。

- [ ] **Step 10: 验证线上 API 和关键流程**

Run: `curl -fsS http://rent.ace-station.top:1111/api/health`

Expected: HTTP 200 且 `status` 为 `ok`。

浏览器验收：

1. 打开版本弹窗，当前版本显示 `V0.6.0`。
2. 打开 3 年合同，按年显示 3 期、按半年显示 6 期，未来期次不进入欠费。
3. 对历史合同核对已到期应收与现有收款严格重算结果。
4. 新增同房源同租户续租合同，默认显示押金沿用且需补为 0；PDF 不要求再次支付。
5. 新增一笔跨期房租，保存前预览分配，保存后应收计划和对账显示一致。
6. 上传、拖拽和预览房租/押金图片凭证，确认原功能无回归。
7. 下载对账 PDF，确认没有累计应收/累计实收，非零结欠为红色。
8. 分别以 1440×900 桌面视口和 390×844 手机视口检查合同、应收、押金和对账页面，确认表格只在自身容器滚动，弹窗文字、按钮和金额无重叠或截断。

- [ ] **Step 11: 留存部署证据**

记录发布提交 SHA、两张镜像 revision、数据库备份文件名、migration 行、计划数、分配数和线上健康检查结果到本次工作总结；不得把 DSM 密码、JWT、数据库密码或代理凭据写入仓库。
