// 分页与全局统计使用同一数据库快照；欠费仅聚合当前页的已到期期次。
export const UNITS_PAGE_QUERY = `
WITH contract_counts AS (
  SELECT "unitId", COUNT(*)::int AS "contractCount", BOOL_OR("endDate" < $1::date) AS expired
  FROM contracts WHERE "deletedAt" IS NULL GROUP BY "unitId"
), active_contracts AS (
  SELECT DISTINCT ON ("unitId") "unitId", id, "tenantName", "startDate", "endDate", "annualRent"
  FROM contracts
  WHERE "deletedAt" IS NULL AND "startDate" <= $1::date AND "endDate" >= $1::date
  ORDER BY "unitId", "startDate" DESC, id
), unit_summary AS (
  SELECT u.id, u.code, u.location, u.area, COALESCE(c."contractCount", 0) AS "contractCount",
    CASE WHEN a.id IS NOT NULL THEN
      CASE WHEN a."endDate" <= $1::date + 45 THEN 'expiring' ELSE 'occupied' END
      WHEN c.expired THEN 'expired' ELSE 'vacant' END AS status,
    CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', a.id, 'tenantName', a."tenantName", 'startDate', a."startDate",
      'endDate', a."endDate", 'annualRent', a."annualRent") END AS "activeContract",
    COALESCE(a."annualRent", 0) AS "activeAnnualRent"
  FROM factory_units u
  LEFT JOIN contract_counts c ON c."unitId" = u.id
  LEFT JOIN active_contracts a ON a."unitId" = u.id
  WHERE u."deletedAt" IS NULL
), page_units AS (
  SELECT * FROM unit_summary ORDER BY code, id LIMIT $2 OFFSET $3
), due_schedules AS (
  SELECT s.id, c."unitId", s."receivableAmount"
  FROM page_units u JOIN contracts c ON c."unitId" = u.id AND c."deletedAt" IS NULL
  JOIN rent_receivable_schedules s ON s."contractId" = c.id
  WHERE s."deletedAt" IS NULL AND s."dueDate" <= $1::date
), schedule_balances AS (
  SELECT s.id, s."unitId", GREATEST(s."receivableAmount" - COALESCE(SUM(a."allocatedAmount"), 0), 0) AS outstanding
  FROM due_schedules s
  LEFT JOIN rent_payment_allocations a ON a."rentReceivableScheduleId" = s.id AND a."deletedAt" IS NULL
  GROUP BY s.id, s."unitId", s."receivableAmount"
), unit_balances AS (
  SELECT "unitId", SUM(outstanding) AS outstanding FROM schedule_balances GROUP BY "unitId"
)
SELECT
  COALESCE((SELECT jsonb_agg(to_jsonb(p) - 'activeAnnualRent' ||
    jsonb_build_object('outstandingAmount', COALESCE(b.outstanding, 0)) ORDER BY p.code, p.id)
    FROM page_units p LEFT JOIN unit_balances b ON b."unitId" = p.id), '[]'::jsonb) AS items,
  COUNT(*)::int AS total,
  jsonb_build_object(
    'occupiedCount', COUNT(*) FILTER (WHERE status IN ('occupied', 'expiring')),
    'vacantCount', COUNT(*) FILTER (WHERE status = 'vacant'),
    'expiringCount', COUNT(*) FILTER (WHERE status = 'expiring'),
    'expiredCount', COUNT(*) FILTER (WHERE status = 'expired'),
    'activeRentSum', COALESCE(SUM("activeAnnualRent"), 0)
  ) AS stats
FROM unit_summary
`;
