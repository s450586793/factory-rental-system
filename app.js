const STORAGE_KEY = "factory-rental-dashboard-v5";

const demoState = {
  units: [
    {
      id: "u1",
      code: "A-01",
      location: "东区 1 号车间",
      area: 860,
      rent: 201600,
      tenantName: "宏远机械加工",
      tenantPhone: "13900001234",
      startDate: "2025-08-01",
      endDate: "2026-07-31",
      contractFiles: [],
      utilitySettings: {
        electric: {
          unitPrice: 1.2,
          lossPercent: 5,
          meters: [{ id: "u1-e-1", name: "大仓库主表", multiplier: 80 }],
        },
        water: {
          unitPrice: 0,
          lossPercent: 0,
          meters: [],
        },
      },
    },
    {
      id: "u2",
      code: "A-02",
      location: "东区 2 号车间",
      area: 620,
      rent: 151200,
      tenantName: "众鑫包装厂",
      tenantPhone: "13800004567",
      startDate: "2025-04-01",
      endDate: "2026-03-31",
      contractFiles: [],
      utilitySettings: {
        electric: {
          unitPrice: 0.95,
          lossPercent: 5,
          meters: [
            { id: "u2-e-1", name: "大理石车间", multiplier: 1 },
            { id: "u2-e-2", name: "办公室", multiplier: 1 },
          ],
        },
        water: {
          unitPrice: 0,
          lossPercent: 0,
          meters: [],
        },
      },
    },
    {
      id: "u3",
      code: "B-01",
      location: "西区 1 号厂房",
      area: 1200,
      rent: 276000,
      tenantName: "",
      tenantPhone: "",
      startDate: "",
      endDate: "",
      contractFiles: [],
      utilitySettings: {
        electric: { unitPrice: 0, lossPercent: 5, meters: [] },
        water: { unitPrice: 0, lossPercent: 0, meters: [] },
      },
    },
  ],
  utilities: [
    {
      id: "ut1",
      unitId: "u1",
      type: "electric",
      previousReadAt: "2026-03-02",
      currentReadAt: "2026-03-08",
      createdAt: "2026-03-08",
      unitPrice: 1.2,
      lossPercent: 5,
      status: "paid",
      paidAt: "2026-03-08",
      meters: [
        {
          meterId: "u1-e-1",
          name: "大仓库主表",
          multiplier: 80,
          previousReadAt: "2026-03-02",
          currentReadAt: "2026-03-08",
          previousReading: 4128.95,
          currentReading: 4136.97,
        },
      ],
    },
    {
      id: "ut2",
      unitId: "u2",
      type: "electric",
      previousReadAt: "2025-04-06",
      currentReadAt: "2025-07-28",
      createdAt: "2025-07-28",
      unitPrice: 0.95,
      lossPercent: 5,
      status: "unpaid",
      paidAt: "",
      meters: [
        {
          meterId: "u2-e-1",
          name: "大理石车间",
          multiplier: 1,
          previousReadAt: "2025-04-06",
          currentReadAt: "2025-07-28",
          previousReading: 90493,
          currentReading: 93513,
        },
        {
          meterId: "u2-e-2",
          name: "办公室",
          multiplier: 1,
          previousReadAt: "2025-04-06",
          currentReadAt: "2025-07-28",
          previousReading: 8376,
          currentReading: 8705,
        },
      ],
    },
  ],
};

let state = loadState();
let activeTab = "factory";
let editingUnitId = null;
let editingUtilityId = null;
let activePreviewUnitId = null;
let activeUtilityId = state.utilities[0]?.id ?? null;
let factorySort = { key: "code", dir: "asc" };
let utilitySort = { key: "createdAt", dir: "desc" };

const statsGrid = document.getElementById("stats-grid");
const unitTableBody = document.getElementById("unit-table-body");
const utilityTableBody = document.getElementById("utility-table-body");
const utilityDetailContent = document.getElementById("utility-detail-content");
const utilityDetailTitle = document.getElementById("utility-detail-title");
const contractPreview = document.getElementById("contract-preview");
const unitSearch = document.getElementById("unit-search");
const unitForm = document.getElementById("unit-form");
const utilityForm = document.getElementById("utility-form");
const utilityUnitSelect = document.getElementById("utility-unit-select");
const utilityTypeSelect = document.getElementById("utility-type-select");
const utilityCalcSummary = document.getElementById("utility-calc-summary");
const meterList = document.getElementById("meter-list");
const electricConfigList = document.getElementById("electric-config-list");
const waterConfigList = document.getElementById("water-config-list");
const unitFormTitle = document.getElementById("unit-form-title");
const utilityFormTitle = document.getElementById("utility-form-title");
const utilityIdInput = utilityForm.querySelector('input[name="utilityId"]');
const saveUtilityButton = document.getElementById("save-utility-button");
const unitIdInput = unitForm.querySelector('input[name="unitId"]');
const contractFileInput = unitForm.querySelector('input[name="contractFile"]');
const startDateInput = unitForm.querySelector('[name="startDate"]');
const endDateInput = unitForm.querySelector('[name="endDate"]');
const resetButton = document.getElementById("reset-demo");
const openUnitModalButton = document.getElementById("open-unit-modal");
const openUtilityModalButton = document.getElementById("open-utility-modal");
const closeUnitModalButton = document.getElementById("close-unit-modal");
const closeUtilityModalButton = document.getElementById("close-utility-modal");
const closePreviewModalButton = document.getElementById("close-preview-modal");
const closeUtilityDetailModalButton = document.getElementById("close-utility-detail-modal");
const cancelUnitEdit = document.getElementById("cancel-unit-edit");
const cancelUtilityEdit = document.getElementById("cancel-utility-edit");
const addElectricConfigMeterButton = document.getElementById("add-electric-config-meter");
const addWaterConfigMeterButton = document.getElementById("add-water-config-meter");
const unitModal = document.getElementById("unit-modal");
const utilityModal = document.getElementById("utility-modal");
const previewModal = document.getElementById("preview-modal");
const utilityDetailModal = document.getElementById("utility-detail-modal");

function loadState() {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  const base = saved ? parseState(saved) : structuredClone(demoState);
  return normalizeState(base);
}

function parseState(saved) {
  try {
    return JSON.parse(saved);
  } catch {
    return structuredClone(demoState);
  }
}

function normalizeState(baseState) {
  const next = structuredClone(baseState);
  next.units = (next.units || []).map((unit) => normalizeUnit(unit, next.utilities || []));
  next.utilities = (next.utilities || []).map((record) => normalizeUtilityRecord(record, next.units));
  return next;
}

function normalizeUnit(unit, utilities) {
  const contractFiles = unit.contractFiles || (unit.contractFile ? [unit.contractFile] : []);
  const utilitySettings = unit.utilitySettings || buildUtilitySettingsFromRecords(unit.id, utilities);
  return {
    ...unit,
    contractFiles,
    utilitySettings: {
      electric: normalizeUtilitySetting(utilitySettings.electric, "electric", unit.id),
      water: normalizeUtilitySetting(utilitySettings.water, "water", unit.id),
    },
  };
}

function normalizeUtilitySetting(setting = {}, type, unitId) {
  return {
    unitPrice: Number(setting.unitPrice || 0),
    lossPercent: Number(setting.lossPercent || (type === "electric" ? 5 : 0)),
    meters: (setting.meters || []).map((meter, index) => ({
      id: meter.id || `${unitId}-${type}-${index + 1}`,
      name: meter.name || `${type === "electric" ? "电表" : "水表"}${index + 1}`,
      multiplier: Number(meter.multiplier || 1),
    })),
  };
}

function buildUtilitySettingsFromRecords(unitId, utilities) {
  const buildType = (type, defaultLoss) => {
    const latest = [...utilities]
      .filter((item) => item.unitId === unitId && item.type === type)
      .sort((a, b) => getSortDateValue(b).localeCompare(getSortDateValue(a)))[0];
    return {
      unitPrice: latest?.unitPrice || 0,
      lossPercent: latest?.lossPercent ?? defaultLoss,
      meters: (latest?.meters || []).map((meter, index) => ({
        id: meter.meterId || `${unitId}-${type}-${index + 1}`,
        name: meter.name,
        multiplier: meter.multiplier,
      })),
    };
  };
  return {
    electric: buildType("electric", 5),
    water: buildType("water", 0),
  };
}

function normalizeUtilityRecord(record, units) {
  const unit = units.find((item) => item.id === record.unitId);
  const settings = unit?.utilitySettings?.[record.type];
  const fallbackDate = record.period ? `${record.period}-01` : "";
  return {
    ...record,
    previousReadAt: record.previousReadAt || fallbackDate,
    currentReadAt: record.currentReadAt || record.paidAt || fallbackDate,
    createdAt: record.createdAt || record.paidAt || record.currentReadAt || fallbackDate,
    unitPrice: Number(record.unitPrice || settings?.unitPrice || 0),
    lossPercent: Number(record.lossPercent ?? settings?.lossPercent ?? (record.type === "electric" ? 5 : 0)),
    meters: (record.meters || []).map((meter, index) => ({
      meterId: meter.meterId || settings?.meters?.[index]?.id || `${record.unitId}-${record.type}-${index + 1}`,
      name: meter.name || settings?.meters?.[index]?.name || `${record.type === "electric" ? "电表" : "水表"}${index + 1}`,
      multiplier: Number(meter.multiplier || settings?.meters?.[index]?.multiplier || 1),
      previousReadAt: meter.previousReadAt || record.previousReadAt || fallbackDate,
      currentReadAt: meter.currentReadAt || record.currentReadAt || record.paidAt || fallbackDate,
      previousReading: Number(meter.previousReading || 0),
      currentReading: Number(meter.currentReading || 0),
    })),
  };
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getUnitById(unitId) {
  return state.units.find((unit) => unit.id === unitId);
}

function getUtilityById(utilityId) {
  return state.utilities.find((item) => item.id === utilityId);
}

function formatCurrency(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 4 })}`;
}

function formatDateLabel(dateString) {
  if (!dateString) return "--";
  return dateString;
}

function formatReadingDisplay(dateString, value, count) {
  if (!dateString && value === null) return "--";
  const numberLabel = value === null ? `${count} 只表` : value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  return `${formatDateLabel(dateString)} ${numberLabel}`;
}

function getDaysUntil(dateString) {
  if (!dateString) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);
  return Math.floor((target - today) / 86400000);
}

function getUnitStatus(unit) {
  if (!unit.tenantName) return { key: "vacant", label: "空置中" };
  const days = getDaysUntil(unit.endDate);
  if (days !== null && days <= 45) return { key: "expiring", label: "即将到期" };
  return { key: "occupied", label: "已出租" };
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateMeterUsage(meter) {
  return Math.max(0, (normalizeNumber(meter.currentReading) - normalizeNumber(meter.previousReading)) * normalizeNumber(meter.multiplier || 1));
}

function calculateUtilityTotals(record) {
  const unitPrice = normalizeNumber(record.unitPrice);
  const lossPercent = normalizeNumber(record.lossPercent);
  const totalUsage = (record.meters || []).reduce((sum, meter) => sum + calculateMeterUsage(meter), 0);
  const adjustedUsage = totalUsage * (1 + lossPercent / 100);
  const amount = adjustedUsage * unitPrice;
  return { totalUsage, adjustedUsage, amount };
}

function createStat(label, value, note) {
  const template = document.getElementById("stat-card-template");
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector(".stat-label").textContent = label;
  node.querySelector(".stat-value").textContent = value;
  node.querySelector(".stat-note").textContent = note;
  return node;
}

function renderStats() {
  const rentedUnits = state.units.filter((unit) => unit.tenantName);
  const vacantUnits = state.units.length - rentedUnits.length;
  const expiringUnits = state.units.filter((unit) => getUnitStatus(unit).key === "expiring").length;
  const unpaidUtilities = state.utilities.filter((item) => item.status === "unpaid");
  const unpaidAmount = unpaidUtilities.reduce((sum, item) => sum + calculateUtilityTotals(item).amount, 0);
  const paidUtilities = state.utilities.filter((item) => item.status === "paid");
  const utilityHouseholds = new Set(unpaidUtilities.map((item) => item.unitId)).size;
  const paidAmount = paidUtilities.reduce((sum, item) => sum + calculateUtilityTotals(item).amount, 0);

  statsGrid.innerHTML = "";
  if (activeTab === "utility") {
    statsGrid.append(
      createStat("未收水电", formatCurrency(unpaidAmount), `未缴 ${unpaidUtilities.length} 笔`),
      createStat("未收户数", String(utilityHouseholds), "当前存在未缴水电的房源数"),
      createStat("已收水电", formatCurrency(paidAmount), `已缴 ${paidUtilities.length} 笔`),
      createStat("收费记录", String(state.utilities.length), "水费和电费历史记录总数"),
    );
    return;
  }

  statsGrid.append(
    createStat("房源总数", String(state.units.length), "园区内已录入的所有车间/厂房"),
    createStat("已出租", String(rentedUnits.length), `空置 ${vacantUnits} 间`),
    createStat("年租金合计", formatCurrency(rentedUnits.reduce((sum, unit) => sum + normalizeNumber(unit.rent), 0)), "按当前在租房源统计"),
    createStat("即将到期", String(expiringUnits), "合同 45 天内到期的房源"),
  );
}

function renderTabs() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === activeTab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === activeTab);
  });
}

function getFilteredUnits() {
  const keyword = unitSearch.value.trim().toLowerCase();
  return state.units.filter((unit) => {
    const source = [unit.code, unit.location, unit.tenantName, unit.tenantPhone].join(" ").toLowerCase();
    return !keyword || source.includes(keyword);
  });
}

function renderUnitTable() {
  const units = [...getFilteredUnits()].sort((a, b) => compareFactoryUnits(a, b));
  unitTableBody.innerHTML = "";

  if (!units.length) {
    unitTableBody.innerHTML = '<tr><td colspan="10" class="empty-state">没有匹配的房源。</td></tr>';
    return;
  }

  units.forEach((unit) => {
    const status = getUnitStatus(unit);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${unit.code}</td>
      <td>${unit.location}</td>
      <td>${unit.area} ㎡</td>
      <td>${formatCurrency(unit.rent)}</td>
      <td>${unit.tenantName || "未出租"}</td>
      <td>${unit.startDate || "--"}</td>
      <td>${unit.endDate || "--"}</td>
      <td>${
        unit.contractFiles?.length
          ? `<div class="attachment-list">${unit.contractFiles
              .map(
                (file, index) =>
                  `<button class="link-button" data-preview-unit="${unit.id}" data-file-index="${index}">${file.name}</button>`,
              )
              .join("")}</div>`
          : "未上传"
      }</td>
      <td><span class="status-pill ${status.key}">${status.label}</span></td>
      <td><button class="table-action" data-edit-unit="${unit.id}">编辑</button></td>
    `;
    unitTableBody.appendChild(row);
  });
}

function getReadingSummary(record, field) {
  const key = field === "previous" ? "previousReading" : "currentReading";
  const date = field === "previous" ? record.previousReadAt : record.currentReadAt;
  if (!record.meters?.length) return { label: "--", sortDate: date || "", sortValue: 0 };
  const values = record.meters.map((meter) => normalizeNumber(meter[key]));
  const displayValue = values.length === 1 ? values[0] : values.reduce((sum, value) => sum + value, 0);
  return {
    label: formatReadingDisplay(date, displayValue, values.length),
    sortDate: date || "",
    sortValue: displayValue,
  };
}

function renderUtilityTable() {
  utilityTableBody.innerHTML = "";
  const rows = [...state.utilities].sort((a, b) => compareUtilities(a, b));

  if (!rows.length) {
    utilityTableBody.innerHTML = '<tr><td colspan="10" class="empty-state">还没有录入水电收费记录。</td></tr>';
    return;
  }

  rows.forEach((item) => {
    const unit = getUnitById(item.unitId);
    const totals = calculateUtilityTotals(item);
    const previousDisplay = getReadingSummary(item, "previous");
    const currentDisplay = getReadingSummary(item, "current");
    const tenantLabel = unit?.tenantName || "未出租";
    const previousValue = previousDisplay.sortValue.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
    const currentValue = currentDisplay.sortValue.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${tenantLabel}</td>
      <td>${item.type === "electric" ? "电费" : "水费"}</td>
      <td><div class="reading-cell"><span class="reading-date">${previousDisplay.sortDate || "--"}</span><span class="reading-value">${previousValue}</span></div></td>
      <td><div class="reading-cell"><span class="reading-date">${currentDisplay.sortDate || "--"}</span><span class="reading-value">${currentValue}</span></div></td>
      <td>${item.unitPrice}</td>
      <td>${totals.adjustedUsage.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</td>
      <td>${formatCurrency(totals.amount)}</td>
      <td><span class="status-pill ${item.status}">${item.status === "paid" ? "已缴费" : "未缴费"}</span></td>
      <td><span class="reading-date">${item.createdAt || "--"}</span></td>
      <td>
        <div class="table-actions">
          <button class="table-action" data-view-utility="${item.id}">查看</button>
          <button class="table-action" data-edit-utility="${item.id}">修改</button>
          <button class="table-action" data-delete-utility="${item.id}">删除</button>
          ${item.status === "unpaid" ? `<button class="table-action" data-mark-paid="${item.id}">已缴费</button>` : ""}
        </div>
      </td>
    `;
    utilityTableBody.appendChild(row);
  });
}

function renderUtilityDetailModal() {
  const record = getUtilityById(activeUtilityId);
  if (!record) {
    utilityDetailTitle.textContent = "查看水电费";
    utilityDetailContent.innerHTML = '<p class="empty-state">没有可查看的收费明细。</p>';
    return;
  }
  const unit = getUnitById(record.unitId);
  const totals = calculateUtilityTotals(record);
  const tenantLabel = unit?.tenantName || "未出租";
  const typeLabel = record.type === "electric" ? "电费" : "水费";
  utilityDetailTitle.textContent = "查看水电费";
  utilityDetailContent.innerHTML = `
    <div class="grid-two">
      <label>
        租户
        <div class="readonly-display">${tenantLabel}</div>
      </label>
      <label>
        费用类型
        <div class="readonly-display">${typeLabel}</div>
      </label>
    </div>
    <div class="utility-entry-grid">
      <div class="meter-panel">
        <div class="meter-list">
          ${record.meters
            .map((meter) => {
              const usage = calculateMeterUsage(meter);
              return `
                <div class="meter-sheet">
                  <table class="mini-table meter-sheet-table">
                    <colgroup>
                      <col class="meter-col-label" />
                      <col class="meter-col-value" />
                    </colgroup>
                    <tbody>
                      <tr>
                        <th colspan="2">${meter.name || "未命名表计"}</th>
                      </tr>
                      <tr>
                        <th>倍率</th>
                        <td>${meter.multiplier}</td>
                      </tr>
                      <tr>
                        <th class="readonly-date">${formatDateLabel(meter.previousReadAt || record.previousReadAt)}</th>
                        <td class="readonly-value">${normalizeNumber(meter.previousReading).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</td>
                      </tr>
                      <tr>
                        <th class="readonly-date">${formatDateLabel(meter.currentReadAt || record.currentReadAt)}</th>
                        <td class="readonly-value">${normalizeNumber(meter.currentReading).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</td>
                      </tr>
                      <tr>
                        <th>用量</th>
                        <td>${usage.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
      <div class="calc-summary">
        <table class="mini-table utility-summary-table">
          <tbody>
            <tr>
              <th>单价</th>
              <td>${record.unitPrice || 0} 元</td>
            </tr>
            <tr>
              <th>线损</th>
              <td>${record.lossPercent || 0}%</td>
            </tr>
            <tr>
              <th>实际总用量</th>
              <td>${totals.totalUsage.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <th>计费用量</th>
              <td>${totals.adjustedUsage.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <th>总金额</th>
              <td class="emphasis">${formatCurrency(totals.amount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="primary-button" data-detail-edit="${record.id}">修改水电费</button>
      <button type="button" class="secondary-button" data-detail-delete="${record.id}">删除记录</button>
    </div>
  `;
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "zh-CN");
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0);
}

function applyDirection(result, dir) {
  return dir === "desc" ? -result : result;
}

function compareFactoryUnits(a, b) {
  const statusA = getUnitStatus(a).label;
  const statusB = getUnitStatus(b).label;
  const attachmentCountA = a.contractFiles?.length || 0;
  const attachmentCountB = b.contractFiles?.length || 0;

  let result = 0;
  switch (factorySort.key) {
    case "location":
      result = compareText(a.location, b.location);
      break;
    case "area":
      result = compareNumber(a.area, b.area);
      break;
    case "rent":
      result = compareNumber(a.rent, b.rent);
      break;
    case "tenantName":
      result = compareText(a.tenantName, b.tenantName);
      break;
    case "startDate":
      result = compareText(a.startDate, b.startDate);
      break;
    case "endDate":
      result = compareText(a.endDate, b.endDate);
      break;
    case "attachmentCount":
      result = compareNumber(attachmentCountA, attachmentCountB);
      break;
    case "status":
      result = compareText(statusA, statusB);
      break;
    default:
      result = compareText(a.code, b.code);
      break;
  }
  if (result === 0) result = compareText(a.code, b.code);
  return applyDirection(result, factorySort.dir);
}

function getSortDateValue(record) {
  return record.createdAt || record.paidAt || record.currentReadAt || record.previousReadAt || record.period || "";
}

function compareUtilities(a, b) {
  const totalsA = calculateUtilityTotals(a);
  const totalsB = calculateUtilityTotals(b);
  const unitA = getUnitById(a.unitId);
  const unitB = getUnitById(b.unitId);
  const previousA = getReadingSummary(a, "previous");
  const previousB = getReadingSummary(b, "previous");
  const currentA = getReadingSummary(a, "current");
  const currentB = getReadingSummary(b, "current");

  let result = 0;
  switch (utilitySort.key) {
    case "type":
      result = compareText(a.type, b.type);
      break;
    case "previousDisplay":
      result = compareText(previousA.sortDate, previousB.sortDate) || compareNumber(previousA.sortValue, previousB.sortValue);
      break;
    case "currentDisplay":
      result = compareText(currentA.sortDate, currentB.sortDate) || compareNumber(currentA.sortValue, currentB.sortValue);
      break;
    case "unitPrice":
      result = compareNumber(a.unitPrice, b.unitPrice);
      break;
    case "usage":
      result = compareNumber(totalsA.adjustedUsage, totalsB.adjustedUsage);
      break;
    case "amount":
      result = compareNumber(totalsA.amount, totalsB.amount);
      break;
    case "status":
      result = compareText(a.status, b.status);
      break;
    case "createdAt":
      result = compareText(a.createdAt, b.createdAt);
      break;
    default:
      result = compareText(unitA ? `${unitA.location}${unitA.code}` : "", unitB ? `${unitB.location}${unitB.code}` : "");
      break;
  }
  if (result === 0) result = compareText(getSortDateValue(a), getSortDateValue(b));
  return applyDirection(result, utilitySort.dir);
}

function updateSortButtons() {
  document.querySelectorAll(".table-head-button").forEach((button) => {
    const table = button.dataset.sortTable;
    const key = button.dataset.sortKey;
    const state = table === "factory" ? factorySort : utilitySort;
    const active = key === state.key;
    button.classList.toggle("active", active);
    button.querySelector(".sort-indicator").textContent = active ? (state.dir === "asc" ? "↑" : "↓") : "↕";
  });
}

function renderContractPreview() {
  const unit = getUnitById(activePreviewUnitId);
  const previewIndex = Number(contractPreview.dataset.fileIndex || 0);
  const file = unit?.contractFiles?.[previewIndex];
  if (!unit || !file) {
    contractPreview.innerHTML = '<p class="empty-state">选择一份已上传合同后，可在这里预览。</p>';
    return;
  }
  const isPdf = file.type === "application/pdf";
  contractPreview.innerHTML = `
    <div class="preview-meta">
      <p><strong>${unit.code} · ${unit.location}</strong></p>
      <p>${file.name}</p>
    </div>
    ${
      isPdf
        ? `<iframe class="preview-frame" src="${file.dataUrl}" title="合同预览"></iframe>`
        : `<img class="preview-image" src="${file.dataUrl}" alt="合同预览" />`
    }
  `;
}

function renderSelectOptions() {
  const options = state.units
    .map((unit) => `<option value="${unit.id}">${unit.tenantName || "未出租"}</option>`)
    .join("");
  utilityUnitSelect.innerHTML = options;
}

function openModal(modal) {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function getDefaultEndDate(startDate) {
  if (!startDate) return "";
  const date = new Date(startDate);
  date.setFullYear(date.getFullYear() + 1);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function createConfigRow(container, data = {}) {
  const template = document.getElementById("meter-row-template");
  const row = template.content.firstElementChild.cloneNode(true);
  row.dataset.meterId = data.id || "";
  row.querySelector('[data-field="name"]').value = data.name ?? "";
  row.querySelector('[data-field="multiplier"]').value = data.multiplier ?? 1;
  container.appendChild(row);
}

function collectConfigRows(container, prefix) {
  return [...container.querySelectorAll(".meter-config-row")]
    .map((row, index) => ({
      id: row.dataset.meterId || `${prefix}-${index + 1}`,
      name: row.querySelector('[data-field="name"]').value.trim(),
      multiplier: normalizeNumber(row.querySelector('[data-field="multiplier"]').value),
    }))
    .filter((meter) => meter.name);
}

function resetUnitForm() {
  editingUnitId = null;
  unitForm.reset();
  unitIdInput.value = "";
  unitFormTitle.textContent = "新增房源";
  electricConfigList.innerHTML = "";
  waterConfigList.innerHTML = "";
  createConfigRow(electricConfigList, { id: "new-electric-1", name: "", multiplier: 1 });
}

function resetUtilityForm() {
  editingUtilityId = null;
  utilityForm.reset();
  utilityIdInput.value = "";
  utilityFormTitle.textContent = "添加水电费";
  saveUtilityButton.textContent = "保存水电费";
  utilityTypeSelect.value = "electric";
  meterList.innerHTML = "";
  updateUtilityReadingRows();
}

function fillUtilityForm(utilityId) {
  const record = getUtilityById(utilityId);
  if (!record) return;
  editingUtilityId = record.id;
  utilityIdInput.value = record.id;
  utilityFormTitle.textContent = "修改水电费";
  saveUtilityButton.textContent = "保存修改";
  utilityUnitSelect.value = record.unitId;
  utilityTypeSelect.value = record.type;
  updateUtilityReadingRows();

  const meterMap = new Map(record.meters.map((meter) => [meter.meterId, meter]));
  meterList.querySelectorAll(".meter-sheet").forEach((row) => {
    const meter = meterMap.get(row.dataset.meterId);
    if (!meter) return;
    row.dataset.previousReading = String(meter.previousReading ?? 0);
    row.dataset.previousReadAt = meter.previousReadAt || record.previousReadAt || "";
    row.querySelector('[data-role="previous-date-label"]').textContent = formatDateLabel(meter.previousReadAt || record.previousReadAt);
    row.querySelector('[data-role="previous-reading"]').textContent = `${normalizeNumber(meter.previousReading).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
    row.querySelector('[data-role="current-date-label"]').textContent = formatDateLabel(meter.currentReadAt || record.currentReadAt);
    row.querySelector('[data-field="currentReadAt"]').value = meter.currentReadAt || record.currentReadAt || "";
    row.querySelector('[data-field="currentReading"]').value = meter.currentReading ?? 0;
  });
  updateMeterUsageUI();
}

function deleteUtilityRecord(utilityId) {
  const record = getUtilityById(utilityId);
  if (!record) return;
  if (!window.confirm("确定要删除这条水电记录吗？")) return;
  state.utilities = state.utilities.filter((item) => item.id !== utilityId);
  if (activeUtilityId === utilityId) activeUtilityId = state.utilities[0]?.id ?? null;
  closeModal(utilityDetailModal);
  render();
}

function fillUnitForm(unitId) {
  const unit = getUnitById(unitId);
  if (!unit) return;
  editingUnitId = unit.id;
  unitFormTitle.textContent = `编辑房源 ${unit.code}`;
  unitIdInput.value = unit.id;
  unitForm.querySelector('[name="code"]').value = unit.code;
  unitForm.querySelector('[name="location"]').value = unit.location;
  unitForm.querySelector('[name="area"]').value = unit.area;
  unitForm.querySelector('[name="rent"]').value = unit.rent;
  unitForm.querySelector('[name="tenantName"]').value = unit.tenantName;
  unitForm.querySelector('[name="tenantPhone"]').value = unit.tenantPhone;
  unitForm.querySelector('[name="startDate"]').value = unit.startDate;
  unitForm.querySelector('[name="endDate"]').value = unit.endDate;
  unitForm.querySelector('[name="electricUnitPrice"]').value = unit.utilitySettings.electric.unitPrice;
  unitForm.querySelector('[name="electricLossPercent"]').value = unit.utilitySettings.electric.lossPercent;
  unitForm.querySelector('[name="waterUnitPrice"]').value = unit.utilitySettings.water.unitPrice;
  unitForm.querySelector('[name="waterLossPercent"]').value = unit.utilitySettings.water.lossPercent;
  electricConfigList.innerHTML = "";
  waterConfigList.innerHTML = "";
  unit.utilitySettings.electric.meters.forEach((meter) => createConfigRow(electricConfigList, meter));
  unit.utilitySettings.water.meters.forEach((meter) => createConfigRow(waterConfigList, meter));
  if (!unit.utilitySettings.electric.meters.length) createConfigRow(electricConfigList, { id: `${unit.id}-electric-1`, name: "", multiplier: 1 });
  openModal(unitModal);
}

function getUtilitySetting(unitId, type) {
  return getUnitById(unitId)?.utilitySettings?.[type] || { unitPrice: 0, lossPercent: type === "electric" ? 5 : 0, meters: [] };
}

function getLatestMeterSnapshot(unitId, type, meterId) {
  const records = [...state.utilities]
    .filter((record) => record.unitId === unitId && record.type === type)
    .sort((a, b) => getSortDateValue(b).localeCompare(getSortDateValue(a)));
  for (const record of records) {
    const meter = record.meters.find((item) => item.meterId === meterId);
    if (meter) {
      return { reading: meter.currentReading, date: meter.currentReadAt || record.currentReadAt || record.paidAt || "" };
    }
  }
  return { reading: 0, date: "" };
}

function addReadingRow(configMeter, snapshot) {
  const template = document.getElementById("reading-row-template");
  const row = template.content.firstElementChild.cloneNode(true);
  const today = new Date().toISOString().slice(0, 10);
  const currentDate = today;
  row.dataset.meterId = configMeter.id;
  row.querySelector('[data-role="name"]').textContent = configMeter.name;
  row.querySelector('[data-role="multiplier"]').textContent = `${configMeter.multiplier}`;
  row.querySelector('[data-role="previous-date-label"]').textContent = formatDateLabel(snapshot.date);
  row.querySelector('[data-role="previous-reading"]').textContent = `${snapshot.reading ?? 0}`;
  row.querySelector('[data-role="current-date-label"]').textContent = formatDateLabel(currentDate);
  row.querySelector('[data-field="currentReadAt"]').value = currentDate;
  row.querySelector('[data-field="currentReading"]').value = snapshot.reading ?? 0;
  row.dataset.multiplier = String(configMeter.multiplier);
  row.dataset.previousReading = String(snapshot.reading ?? 0);
  row.dataset.previousReadAt = snapshot.date || "";
  meterList.appendChild(row);
}

function updateUtilityReadingRows() {
  const unitId = utilityUnitSelect.value;
  const type = utilityTypeSelect.value;
  const setting = getUtilitySetting(unitId, type);
  meterList.innerHTML = "";

  if (!setting.meters.length) {
    meterList.innerHTML = '<div class="empty-state">该房源还没有配置固定表计，请先到房源信息里设置。</div>';
    utilityCalcSummary.innerHTML = '<p class="empty-state">缺少固定表计，暂时无法录入抄表数据。</p>';
    return;
  }

  setting.meters.forEach((meter) => {
    const snapshot = getLatestMeterSnapshot(unitId, type, meter.id);
    addReadingRow(meter, snapshot);
  });
  updateMeterUsageUI();
}

function collectReadingRows() {
  return [...meterList.querySelectorAll(".meter-sheet")].map((row) => ({
    meterId: row.dataset.meterId,
    name: row.querySelector('[data-role="name"]').textContent,
    multiplier: normalizeNumber(row.dataset.multiplier),
    previousReadAt: row.dataset.previousReadAt || "",
    currentReadAt: row.querySelector('[data-field="currentReadAt"]').value,
    previousReading: normalizeNumber(row.dataset.previousReading),
    currentReading: normalizeNumber(row.querySelector('[data-field="currentReading"]').value),
  }));
}

function updateMeterUsageUI() {
  const meters = collectReadingRows();
  meterList.querySelectorAll(".meter-sheet").forEach((row, index) => {
    const usage = calculateMeterUsage(meters[index]);
    row.querySelector('[data-role="current-date-label"]').textContent = formatDateLabel(meters[index].currentReadAt);
    row.querySelector('[data-role="usage"]').textContent = `${usage.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
  });

  const setting = getUtilitySetting(utilityUnitSelect.value, utilityTypeSelect.value);
  const totals = calculateUtilityTotals({
    unitPrice: setting.unitPrice,
    lossPercent: setting.lossPercent,
    meters,
  });
  utilityCalcSummary.innerHTML = `
    <table class="mini-table utility-summary-table">
      <tbody>
        <tr>
          <th>单价</th>
          <td>${setting.unitPrice || 0} 元</td>
        </tr>
        <tr>
          <th>线损</th>
          <td>${setting.lossPercent || 0}%</td>
        </tr>
        <tr>
          <th>实际总用量</th>
          <td>${totals.totalUsage.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <th>计费用量</th>
          <td>${totals.adjustedUsage.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <th>总金额</th>
          <td class="emphasis">${formatCurrency(totals.amount)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function render() {
  renderTabs();
  renderStats();
  renderUnitTable();
  renderUtilityTable();
  updateSortButtons();
  renderContractPreview();
  renderSelectOptions();
  saveState();
}

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => {
    activeTab = button.dataset.tab;
    render();
  });
});

document.querySelectorAll("[data-close-modal]").forEach((element) => {
  element.addEventListener("click", () => closeModal(unitModal));
});

document.querySelectorAll("[data-close-utility]").forEach((element) => {
  element.addEventListener("click", () => closeModal(utilityModal));
});

document.querySelectorAll("[data-close-preview]").forEach((element) => {
  element.addEventListener("click", () => closeModal(previewModal));
});

document.querySelectorAll("[data-close-utility-detail]").forEach((element) => {
  element.addEventListener("click", () => closeModal(utilityDetailModal));
});

openUnitModalButton.addEventListener("click", () => {
  resetUnitForm();
  openModal(unitModal);
});

openUtilityModalButton.addEventListener("click", () => {
  resetUtilityForm();
  openModal(utilityModal);
});

closeUnitModalButton.addEventListener("click", () => {
  closeModal(unitModal);
  resetUnitForm();
});

closeUtilityModalButton.addEventListener("click", () => {
  closeModal(utilityModal);
  resetUtilityForm();
});

closePreviewModalButton.addEventListener("click", () => closeModal(previewModal));
closeUtilityDetailModalButton.addEventListener("click", () => closeModal(utilityDetailModal));

cancelUnitEdit.addEventListener("click", () => {
  closeModal(unitModal);
  resetUnitForm();
});

cancelUtilityEdit.addEventListener("click", () => {
  closeModal(utilityModal);
  resetUtilityForm();
});

unitSearch.addEventListener("input", renderUnitTable);

startDateInput.addEventListener("change", () => {
  endDateInput.value = getDefaultEndDate(startDateInput.value);
});

utilityUnitSelect.addEventListener("change", updateUtilityReadingRows);
utilityTypeSelect.addEventListener("change", updateUtilityReadingRows);

electricConfigList.addEventListener("click", (event) => {
  const target = event.target.closest("[data-remove-meter]");
  if (!target) return;
  target.closest(".meter-config-row").remove();
});

waterConfigList.addEventListener("click", (event) => {
  const target = event.target.closest("[data-remove-meter]");
  if (!target) return;
  target.closest(".meter-config-row").remove();
});

addElectricConfigMeterButton.addEventListener("click", () => {
  createConfigRow(electricConfigList, { id: `electric-${Date.now()}`, name: "", multiplier: 1 });
});

addWaterConfigMeterButton.addEventListener("click", () => {
  createConfigRow(waterConfigList, { id: `water-${Date.now()}`, name: "", multiplier: 1 });
});

meterList.addEventListener("input", updateMeterUsageUI);

unitTableBody.addEventListener("click", (event) => {
  const editTarget = event.target.closest("[data-edit-unit]");
  if (editTarget) {
    fillUnitForm(editTarget.dataset.editUnit);
    return;
  }

  const previewTarget = event.target.closest("[data-preview-unit]");
  if (previewTarget) {
    activePreviewUnitId = previewTarget.dataset.previewUnit;
    contractPreview.dataset.fileIndex = previewTarget.dataset.fileIndex || "0";
    renderContractPreview();
    openModal(previewModal);
  }
});

utilityTableBody.addEventListener("click", (event) => {
  const target = event.target.closest("[data-view-utility]");
  if (target) {
    activeUtilityId = target.dataset.viewUtility;
    renderUtilityDetailModal();
    openModal(utilityDetailModal);
    return;
  }

  const editTarget = event.target.closest("[data-edit-utility]");
  if (editTarget) {
    fillUtilityForm(editTarget.dataset.editUtility);
    openModal(utilityModal);
    return;
  }

  const deleteTarget = event.target.closest("[data-delete-utility]");
  if (deleteTarget) {
    deleteUtilityRecord(deleteTarget.dataset.deleteUtility);
    return;
  }

  const paidTarget = event.target.closest("[data-mark-paid]");
  if (!paidTarget) return;
  const record = getUtilityById(paidTarget.dataset.markPaid);
  if (!record) return;
  record.status = "paid";
  record.paidAt = new Date().toISOString().slice(0, 10);
  activeUtilityId = record.id;
  render();
});

utilityDetailContent.addEventListener("click", (event) => {
  const editTarget = event.target.closest("[data-detail-edit]");
  if (editTarget) {
    closeModal(utilityDetailModal);
    fillUtilityForm(editTarget.dataset.detailEdit);
    openModal(utilityModal);
    return;
  }

  const deleteTarget = event.target.closest("[data-detail-delete]");
  if (deleteTarget) {
    deleteUtilityRecord(deleteTarget.dataset.detailDelete);
  }
});

document.querySelectorAll(".table-head-button").forEach((button) => {
  button.addEventListener("click", () => {
    const table = button.dataset.sortTable;
    const key = button.dataset.sortKey;
    const state = table === "factory" ? factorySort : utilitySort;
    if (state.key === key) {
      state.dir = state.dir === "asc" ? "desc" : "asc";
    } else {
      state.key = key;
      state.dir = key === "createdAt" ? "desc" : "asc";
    }
    render();
  });
});

unitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(unitForm);
  const next = {
    code: form.get("code").trim(),
    location: form.get("location").trim(),
    area: normalizeNumber(form.get("area")),
    rent: normalizeNumber(form.get("rent")),
    tenantName: form.get("tenantName").trim(),
    tenantPhone: form.get("tenantPhone").trim(),
    startDate: form.get("startDate"),
    endDate: form.get("endDate"),
    utilitySettings: {
      electric: {
        unitPrice: normalizeNumber(form.get("electricUnitPrice")),
        lossPercent: normalizeNumber(form.get("electricLossPercent")),
        meters: collectConfigRows(electricConfigList, `${editingUnitId || "new"}-electric`),
      },
      water: {
        unitPrice: normalizeNumber(form.get("waterUnitPrice")),
        lossPercent: normalizeNumber(form.get("waterLossPercent")),
        meters: collectConfigRows(waterConfigList, `${editingUnitId || "new"}-water`),
      },
    },
  };

  const selectedFiles = [...contractFileInput.files];
  const contractFiles = await Promise.all(selectedFiles.map((file) => readFileAsDataUrl(file)));

  if (editingUnitId) {
    const unit = getUnitById(editingUnitId);
    Object.assign(unit, next);
    if (contractFiles.length) unit.contractFiles = [...(unit.contractFiles || []), ...contractFiles];
  } else {
    const newId = crypto.randomUUID();
    state.units.unshift({
      id: newId,
      ...next,
      contractFiles,
      utilitySettings: {
        electric: {
          ...next.utilitySettings.electric,
          meters: next.utilitySettings.electric.meters.map((meter, index) => ({
            ...meter,
            id: `${newId}-electric-${index + 1}`,
          })),
        },
        water: {
          ...next.utilitySettings.water,
          meters: next.utilitySettings.water.meters.map((meter, index) => ({
            ...meter,
            id: `${newId}-water-${index + 1}`,
          })),
        },
      },
    });
  }

  closeModal(unitModal);
  resetUnitForm();
  render();
});

utilityForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(utilityForm);
  const unitId = form.get("unitId");
  const type = form.get("type");
  const setting = getUtilitySetting(unitId, type);
  const meters = collectReadingRows();
  if (!meters.length) return;
  const createdAt = new Date().toISOString().slice(0, 10);
  const previousReadAt = meters.reduce((latest, meter) => (!latest || meter.previousReadAt > latest ? meter.previousReadAt : latest), "");
  const currentReadAt = meters.reduce((latest, meter) => (!latest || meter.currentReadAt > latest ? meter.currentReadAt : latest), "");

  const record = {
    id: editingUtilityId || crypto.randomUUID(),
    unitId,
    type,
    previousReadAt,
    currentReadAt,
    createdAt: editingUtilityId ? getUtilityById(editingUtilityId)?.createdAt || createdAt : createdAt,
    unitPrice: setting.unitPrice,
    lossPercent: setting.lossPercent,
    status: editingUtilityId ? getUtilityById(editingUtilityId)?.status || "unpaid" : "unpaid",
    paidAt: editingUtilityId ? getUtilityById(editingUtilityId)?.paidAt || "" : "",
    meters,
  };
  if (editingUtilityId) {
    const index = state.utilities.findIndex((item) => item.id === editingUtilityId);
    if (index >= 0) state.utilities.splice(index, 1, record);
  } else {
    state.utilities.unshift(record);
  }
  activeUtilityId = record.id;
  closeModal(utilityModal);
  resetUtilityForm();
  render();
});

resetButton.addEventListener("click", () => {
  state = structuredClone(demoState);
  editingUnitId = null;
  activePreviewUnitId = null;
  activeUtilityId = state.utilities[0]?.id ?? null;
  closeModal(unitModal);
  closeModal(utilityModal);
  closeModal(previewModal);
  closeModal(utilityDetailModal);
  resetUnitForm();
  resetUtilityForm();
  render();
});

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        dataUrl: reader.result,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

resetUnitForm();
resetUtilityForm();
closeModal(unitModal);
closeModal(utilityModal);
closeModal(previewModal);
closeModal(utilityDetailModal);
render();
