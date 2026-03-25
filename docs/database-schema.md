# 数据库表说明

当前系统使用 `TypeORM + PostgreSQL`，表结构由后端实体自动映射生成。

## 建表方式

- 默认通过环境变量 `DB_SYNCHRONIZE=true` 自动建表
- 第一次启动 `backend` 容器时，NestJS 会根据实体创建或更新表
- 如果之后需要更稳的生产变更流程，建议再切换到 TypeORM migration

## 主要表

- `admin_users`
  超级管理员账号，保存登录用户名和加密后的密码。

- `stored_files`
  统一文件元数据表，保存营业执照、合同附件、收据 PDF 的文件信息和存储路径。

- `factory_units`
  厂房主表，保存厂房编号、位置等基础信息。

- `contracts`
  合同历史表，保存租户快照、合同起止、年租金、营业执照关联。

- `contract_attachment_files`
  合同与附件的多对多关联表。

- `utility_meter_configs`
  水表/电表配置表，保存表名、初始读数、倍率、单价、线损、启用状态。

- `utility_charge_records`
  水电收费主表，保存租户快照、抄表日期、总用量、调整后用量、金额、缴费状态。

- `utility_charge_items`
  水电收费明细表，保存每个表计的上次读数、本次读数、倍率、单价、线损快照和金额。

- `rent_payments`
  房租收费表，保存实际收款日期、金额、方式、备注，并关联具体合同。

- `deposit_records`
  押金流水表，支持 `received` 和 `refunded` 两类记录。

- `receipts`
  收据表，保存收据编号、来源记录、金额快照、开具日期、PDF 文件关联和作废状态。

## 表关系概览

- 一个 `factory_units` 可以对应多条 `contracts`
- 一个 `factory_units` 可以对应多条 `utility_meter_configs`
- 一个 `contracts` 可以对应多条 `utility_charge_records`
- 一个 `utility_charge_records` 可以对应多条 `utility_charge_items`
- 一个 `contracts` 可以对应多条 `rent_payments`
- 一个 `contracts` 可以对应多条 `deposit_records`
- 一个 `utility_charge_records` 或 `rent_payments` 最多对应一条有效 `receipts`
