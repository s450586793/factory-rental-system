# 数据库表结构说明

当前系统使用 `TypeORM + PostgreSQL`，数据库生命周期已调整为：

- 实体定义：维护在 `backend/src/**/*.entity.ts`
- schema 变更：通过 migration 管理
- 首次部署：`migration + seed admin`
- 仅本地临时开发才建议使用 `DB_SYNCHRONIZE=true`

相关文档见 [database-migrations.md](./database-migrations.md)。

## 主要表

- `admin_users`
  超级管理员账号，保存登录用户名和加密后的密码。

- `stored_files`
  统一文件元数据表，保存营业执照、合同附件、收据 PDF 的文件信息和存储路径。

- `factory_units`
  厂房主表，保存厂房编号、位置等基础信息。

- `contracts`
  合同历史表，保存租户快照、合同起止、年租金、营业执照关联。`electricUnitPrice`、`electricLineLossPercent`、`waterUnitPrice` 保存该合同约定的电费单价、电费线损和水费单价；`billingFrequency` 记录应收计划频率（`annual` 或 `semiannual`）；`depositSettlementMode` 记录押金结算方式（`initial` 或 `carryover`）；`depositCarryoverAmount` 保存本合同从续租来源结转的押金金额；`depositCarryoverSourceContractId` 可为空，指向结转来源合同。

- `contract_attachment_files`
  合同与附件的多对多关联表。

- `utility_meter_configs`
  水表/电表配置表，保存表名、初始读数、倍率、默认单价、默认线损和启用状态。新合同在没有历史合同时可读取这里的价格作为表单初始值，实际收费以所选合同的计费条款为准。

- `utility_charge_records`
  水电收费主表，保存租户快照、抄表日期、总用量、调整后用量、金额、缴费状态。

- `utility_charge_record_attachment_files`
  水电收费记录与收款凭证文件的多对多关联表。

- `utility_charge_items`
  水电收费明细表，保存每个表计的上次读数、本次读数、倍率、单价、线损快照和金额。

- `rent_payments`
  房租收费表，保存实际收款日期、金额、方式、备注，并关联具体合同。

- `rent_receivable_schedules`
  房租应收计划表，按合同与计费频率保存每期序号、期间起止、到期日和应收金额。

- `rent_payment_allocations`
  房租付款分配表，记录每笔 `rent_payments` 向各期 `rent_receivable_schedules` 分配的金额。

- `deposit_records`
  押金流水表，支持 `received` 和 `refunded` 两类记录。

- `receipts`
  收据表，保存收据编号、来源记录、金额快照、开具日期、PDF 文件关联和作废状态。

## 表关系概览

- 一个 `factory_units` 可以对应多条 `contracts`
- 一个 `factory_units` 可以对应多条 `utility_meter_configs`
- 一个 `contracts` 可以对应多条 `utility_charge_records`
- 一个 `utility_charge_records` 可以对应多条 `utility_charge_items`
- 一个 `utility_charge_records` 可以对应多条 `stored_files` 收款凭证
- 一个 `contracts` 可以对应多条 `rent_payments`
- 一个 `contracts` 可以对应多条 `rent_receivable_schedules`
- 一个 `rent_payments` 可以对应多条 `rent_payment_allocations`
- 一个 `rent_receivable_schedules` 可以对应多条 `rent_payment_allocations`
- `contracts.depositCarryoverSourceContractId` 可自关联到一条来源 `contracts`；删除来源合同时该字段置空
- 一个 `contracts` 可以对应多条 `deposit_records`
- 一个 `utility_charge_records` 或 `rent_payments` 最多对应一条有效 `receipts`

## 关键约束

- `rent_receivable_schedules` 对 `(contractId, sequence)` 设置唯一约束，保证每份合同内期次唯一。
- `rent_payment_allocations` 对 `(rentPaymentId, rentReceivableScheduleId)` 设置唯一约束，防止同一付款重复分配至同一期应收。
- `contracts.depositCarryoverAmount` 设置非负校验；`depositCarryoverSourceContractId` 为指向 `contracts.id` 的外键，删除来源合同后置空。
