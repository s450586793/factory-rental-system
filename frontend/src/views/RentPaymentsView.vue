<template>
  <AppShell>
    <template #top-actions>
      <div class="toolbar-row">
        <el-button type="primary" :icon="Plus" @click="openCreate">新增房租收费</el-button>
        <el-tooltip content="刷新房租数据" placement="bottom">
          <el-button :icon="Refresh" aria-label="刷新" @click="loadPageData">刷新</el-button>
        </el-tooltip>
      </div>
    </template>

    <section class="panel-card page-panel">
      <div class="page-header">
        <div>
          <h2>房租收费</h2>
        </div>
      </div>

      <el-tabs v-model="activeTab" class="rent-payments-tabs">
        <el-tab-pane
          label="应收计划"
          name="receivables"
          data-test="receivables-tab"
          :class="{ 'is-active': activeTab === 'receivables' }"
        >
          <div class="page-filters compact-filters receivables-filters">
            <el-select
              v-model="receivableFilters.unitId"
              clearable
              placeholder="筛选厂房"
              data-test="receivable-unit-filter"
              aria-label="应收房源筛选"
            >
              <el-option label="全部厂房" value="" />
              <el-option
                v-for="unit in units"
                :key="unit.id"
                :label="`${unit.code} / ${unit.location}`"
                :value="unit.id"
              />
            </el-select>
            <el-select
              v-model="receivableFilters.tenantName"
              clearable
              placeholder="筛选租户"
              data-test="receivable-tenant-filter"
              aria-label="应收租户筛选"
            >
              <el-option label="全部租户" value="" />
              <el-option v-for="tenant in receivableTenantOptions" :key="tenant" :label="tenant" :value="tenant" />
            </el-select>
            <el-select
              v-model="receivableFilters.year"
              clearable
              placeholder="筛选年度"
              data-test="receivable-year-filter"
              aria-label="应收年度筛选"
            >
              <el-option label="全部年度" value="" />
              <el-option v-for="year in receivableYearOptions" :key="year" :label="`${year} 年`" :value="String(year)" />
            </el-select>
            <el-select
              v-model="receivableFilters.status"
              clearable
              placeholder="筛选状态"
              data-test="receivable-status-filter"
              aria-label="应收状态筛选"
            >
              <el-option label="全部状态" value="" />
              <el-option label="未到期" value="not-due" />
              <el-option label="部分预收" value="partially-prepaid" />
              <el-option label="已预收" value="prepaid" />
              <el-option label="欠费" value="overdue" />
              <el-option label="已结清" value="settled" />
            </el-select>
            <el-button @click="resetReceivableFilters">清空筛选</el-button>
          </div>

          <div class="table-shell">
            <el-table :data="filteredReceivables" v-loading="loading" class="rent-receivables-table" size="small">
              <el-table-column label="厂房" width="112" show-overflow-tooltip>
                <template #default="{ row }">
                  {{ row.unit ? `${row.unit.code} / ${row.unit.location}` : "--" }}
                </template>
              </el-table-column>
              <el-table-column prop="tenantName" label="租户" min-width="118" show-overflow-tooltip />
              <el-table-column label="租赁期间" width="202">
                <template #default="{ row }">
                  {{ row.periodStart }} 至 {{ row.periodEnd }}
                </template>
              </el-table-column>
              <el-table-column prop="dueDate" label="到期日" width="102" />
              <el-table-column label="应收" width="108" align="right">
                <template #default="{ row }">{{ formatCurrency(row.receivableAmount) }}</template>
              </el-table-column>
              <el-table-column label="实收" width="108" align="right">
                <template #default="{ row }">{{ formatCurrency(row.paidAmount) }}</template>
              </el-table-column>
              <el-table-column label="欠费 / 预收" width="124" align="right">
                <template #default="{ row }">
                  <span
                    class="receivable-balance"
                    :class="{ 'is-overdue': row.status === 'overdue' && row.outstandingAmount > 0 }"
                    :data-test="`receivable-balance-${row.id}`"
                  >
                    {{ receivableBalanceLabel(row) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="94" align="center">
                <template #default="{ row }">
                  <el-tag :type="receivableStatusTagType(row.status)" size="small">
                    {{ receivableStatusLabel(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="118" :fixed="actionColumnFixed">
                <template #default="{ row }">
                  <el-button
                    text
                    type="primary"
                    :icon="Wallet"
                    :disabled="row.outstandingAmount <= 0 || !row.contract || !row.unit"
                    :aria-label="`登记第 ${row.sequence} 期收款`"
                    :data-test="`register-schedule-payment-${row.id}`"
                    @click="openSchedulePayment(row)"
                  >
                    登记收款
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <el-tab-pane
          label="收款记录"
          name="payments"
          data-test="payments-tab"
          :class="{ 'is-active': activeTab === 'payments' }"
        >
          <div class="page-filters compact-filters">
            <el-select v-model="paymentFilters.unitId" clearable placeholder="筛选厂房" aria-label="收款房源筛选">
              <el-option v-for="unit in units" :key="unit.id" :label="`${unit.code} / ${unit.location}`" :value="unit.id" />
            </el-select>
            <el-select v-model="paymentFilters.receiptStatus" placeholder="收据状态" aria-label="收据状态筛选">
              <el-option label="全部收据状态" value="all" />
              <el-option label="未开收据" value="pending" />
              <el-option label="已开收据" value="issued" />
            </el-select>
            <el-input
              v-model="paymentFilters.keyword"
              clearable
              placeholder="搜索租户 / 备注 / 方式"
              aria-label="收款记录搜索"
            />
            <el-button @click="resetPaymentFilters">清空筛选</el-button>
          </div>

          <div class="table-shell">
            <el-table :data="filteredPayments" v-loading="loading" class="rent-payments-table" size="small">
              <el-table-column label="厂房" width="54">
                <template #default="{ row }">
                  {{ row.unit.code }}
                </template>
              </el-table-column>
              <el-table-column prop="tenantNameSnapshot" label="租户" min-width="118" show-overflow-tooltip />
              <el-table-column label="合同周期" min-width="154" show-overflow-tooltip>
                <template #default="{ row }">
                  {{ row.contract.startDate }} 至 {{ row.contract.endDate }}
                </template>
              </el-table-column>
              <el-table-column prop="paymentDate" label="付款日期" width="102" />
              <el-table-column label="金额" width="98">
                <template #default="{ row }">
                  {{ formatCurrency(row.amount) }}
                </template>
              </el-table-column>
              <el-table-column prop="method" label="方式" width="68" show-overflow-tooltip />
              <el-table-column label="凭证" width="76">
                <template #default="{ row }">
                  <el-button
                    v-if="row.attachmentFiles.length"
                    text
                    type="primary"
                    :icon="Picture"
                    :aria-label="`预览 ${row.attachmentFiles.length} 张收款凭证`"
                    @click="openVoucherPreview(row.attachmentFiles)"
                  >
                    {{ row.attachmentFiles.length }} 张
                  </el-button>
                  <span v-else>--</span>
                </template>
              </el-table-column>
              <el-table-column label="收据状态" width="88">
                <template #default="{ row }">
                  <el-tag :type="row.activeReceipt ? 'success' : 'info'" size="small">
                    {{ row.activeReceipt ? "已开" : "未开" }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="备注" min-width="132" show-overflow-tooltip>
                <template #default="{ row }">
                  {{ row.note || "--" }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="164" :fixed="actionColumnFixed">
                <template #default="{ row }">
                  <el-space wrap size="small">
                    <el-button text :icon="Edit" aria-label="编辑收款" @click="openEdit(row)">编辑</el-button>
                    <el-button
                      v-if="row.activeReceipt?.pdfFile"
                      text
                      type="primary"
                      :icon="View"
                      aria-label="查看收据"
                      @click="openReceiptPreview(row.activeReceipt.pdfFile.id)"
                    >
                      查看收据
                    </el-button>
                    <el-button
                      v-else
                      text
                      type="primary"
                      :icon="Tickets"
                      aria-label="开收据"
                      @click="createReceipt(row.id)"
                    >
                      开收据
                    </el-button>
                  </el-space>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑房租收费' : '登记房租收费'"
      width="680px"
      @closed="invalidateAllocationPreview"
    >
      <el-form label-position="top">
        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="厂房">
              <el-select
                v-model="form.unitId"
                style="width: 100%"
                aria-label="厂房"
                @change="handleUnitChange"
              >
                <el-option
                  v-for="unit in units"
                  :key="unit.id"
                  :label="`${unit.code} / ${unit.location}`"
                  :value="unit.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="对应合同">
              <el-select v-model="form.contractId" style="width: 100%" aria-label="对应合同">
                <el-option
                  v-for="contractItem in selectedContracts"
                  :key="contractItem.id"
                  :label="`${contractItem.tenantName} (${contractItem.startDate}~${contractItem.endDate})`"
                  :value="contractItem.id"
                />
              </el-select>
              <div v-if="selectedContract" class="form-help-inline">
                当前合同欠费：{{ formatCurrency(selectedContract.outstandingAmount) }}
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="付款日期">
              <el-date-picker
                v-model="form.paymentDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
                aria-label="付款日期"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="金额">
              <el-input-number
                v-model="form.amount"
                :min="0"
                :precision="2"
                style="width: 100%"
                aria-label="金额"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <div
          v-if="allocationPreviewLoading || allocationPreview || allocationPreviewError"
          v-loading="allocationPreviewLoading"
          class="allocation-preview"
          data-test="allocation-preview"
        >
          <div class="allocation-preview-head">
            <strong>收款分配</strong>
            <span v-if="allocationPreviewError" class="allocation-preview-error">{{ allocationPreviewError }}</span>
          </div>
          <div v-if="allocationPreview" class="allocation-preview-list">
            <div v-for="item in allocationPreview.allocations" :key="item.scheduleId" class="allocation-preview-row">
              <span>第 {{ item.sequence }} 期</span>
              <span>{{ item.periodStart }} 至 {{ item.periodEnd }}</span>
              <strong>{{ formatCurrency(item.allocatedAmount) }}</strong>
            </div>
            <div v-if="allocationPreview.unallocatedAmount > 0" class="allocation-preview-row is-unallocated">
              <span>未分配结余</span>
              <span></span>
              <strong>{{ formatCurrency(allocationPreview.unallocatedAmount) }}</strong>
            </div>
          </div>
        </div>

        <el-form-item label="付款方式">
          <el-input v-model="form.method" placeholder="例如 转账、现金" />
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="3" />
        </el-form-item>

        <el-form-item label="收款凭证图片">
          <PaymentVoucherUpload
            v-model="voucherUploads"
            :existing-files="existingVoucherFiles"
            :disabled="submitting"
            @remove-existing="removeExistingVoucher"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button
          v-if="form.id"
          type="danger"
          plain
          :icon="Delete"
          aria-label="删除收款"
          @click="confirmRemove(form.id, true)"
        >
          删除
        </el-button>
        <el-button @click="closePaymentDialog">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="receiptPreviewVisible" title="收据预览" width="960px">
      <iframe v-if="receiptPreviewFileId" class="file-preview-frame" :src="apiFileUrl(receiptPreviewFileId)" />
      <template #footer>
        <el-button @click="receiptPreviewVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <PaymentVoucherPreviewDialog
      v-model="voucherPreviewVisible"
      :files="voucherPreviewFiles"
      title="房租收款凭证"
    />
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { Delete, Edit, Picture, Plus, Refresh, Tickets, View, Wallet } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AppShell from "../components/AppShell.vue";
import PaymentVoucherUpload from "../components/PaymentVoucherUpload.vue";
import PaymentVoucherPreviewDialog from "../components/PaymentVoucherPreviewDialog.vue";
import { apiFileUrl } from "../api/client";
import { filesApi, receiptsApi, rentPaymentsApi, rentReceivablesApi, unitsApi } from "../api";
import { useViewportWidth } from "../composables/useViewportWidth";
import type {
  Contract,
  Receipt,
  RentPayment,
  RentPaymentAllocationPreview,
  RentReceivable,
  StoredFile,
  UnitSummary,
} from "../types/models";
import { formatCurrency, todayIso } from "../utils/format";

type ActiveTab = "receivables" | "payments";

type RentPaymentRow = RentPayment & {
  activeReceipt: Receipt | null;
};

type RentReceivableRow = RentReceivable & {
  unit: UnitSummary | null;
  contract: Contract | null;
  tenantName: string;
};

const PREVIEW_DEBOUNCE_MS = 180;

const activeTab = ref<ActiveTab>("receivables");
const loading = ref(false);
const dialogVisible = ref(false);
const submitting = ref(false);
const units = ref<UnitSummary[]>([]);
const payments = ref<RentPayment[]>([]);
const receipts = ref<Receipt[]>([]);
const receivables = ref<RentReceivable[]>([]);
const allocationPreview = ref<RentPaymentAllocationPreview | null>(null);
const allocationPreviewLoading = ref(false);
const allocationPreviewError = ref("");
const receiptPreviewVisible = ref(false);
const receiptPreviewFileId = ref("");
const existingVoucherFiles = ref<StoredFile[]>([]);
const voucherUploads = ref<File[]>([]);
const voucherPreviewVisible = ref(false);
const voucherPreviewFiles = ref<StoredFile[]>([]);
const viewportWidth = useViewportWidth();

let allocationPreviewTimer: ReturnType<typeof setTimeout> | undefined;
let allocationPreviewRequestSequence = 0;

const form = reactive({
  id: "",
  unitId: "",
  contractId: "",
  paymentDate: todayIso(),
  amount: 0,
  method: "转账",
  note: "",
});

const paymentFilters = reactive({
  unitId: "",
  receiptStatus: "all" as "all" | "pending" | "issued",
  keyword: "",
});

const receivableFilters = reactive({
  unitId: "",
  tenantName: "",
  year: "",
  status: "" as "" | RentReceivable["status"],
});

const selectedUnit = computed(() => units.value.find((item) => item.id === form.unitId) || null);
const selectedContract = computed(() => selectedUnit.value?.contracts.find((item) => item.id === form.contractId) || null);
const selectedContracts = computed<Contract[]>(() => selectedUnit.value?.contracts ?? []);
const actionColumnFixed = computed<false | "right">(() => (viewportWidth.value < 768 ? false : "right"));

const activeReceiptMap = computed(() => {
  const map = new Map<string, Receipt>();
  receipts.value
    .filter((receipt) => receipt.sourceType === "rent-payment" && receipt.status === "active")
    .forEach((receipt) => {
      map.set(receipt.sourceId, receipt);
    });
  return map;
});

const paymentRows = computed<RentPaymentRow[]>(() =>
  payments.value.map((payment) => ({
    ...payment,
    activeReceipt: activeReceiptMap.value.get(payment.id) ?? null,
  })),
);

const filteredPayments = computed(() => {
  const keyword = paymentFilters.keyword.trim().toLowerCase();
  return paymentRows.value.filter((payment) => {
    if (paymentFilters.unitId && payment.unitId !== paymentFilters.unitId) {
      return false;
    }
    if (paymentFilters.receiptStatus === "issued" && !payment.activeReceipt) {
      return false;
    }
    if (paymentFilters.receiptStatus === "pending" && payment.activeReceipt) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    return [
      payment.tenantNameSnapshot,
      payment.method,
      payment.note || "",
      payment.unit.code,
      payment.unit.location,
    ]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });
});

const contractContextMap = computed(() => {
  const map = new Map<string, { unit: UnitSummary; contract: Contract }>();
  units.value.forEach((unit) => {
    unit.contracts.forEach((contract) => {
      map.set(contract.id, { unit, contract });
    });
  });
  return map;
});

const receivableRows = computed<RentReceivableRow[]>(() =>
  receivables.value.map((receivable) => {
    const context = contractContextMap.value.get(receivable.contractId);
    return {
      ...receivable,
      unit: context?.unit ?? null,
      contract: context?.contract ?? null,
      tenantName: context?.contract.tenantName ?? "--",
    };
  }),
);

const receivableTenantOptions = computed(() =>
  [...new Set(receivableRows.value.map((item) => item.tenantName).filter((tenant) => tenant !== "--"))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  ),
);

const receivableYearOptions = computed(() =>
  [...new Set(receivableRows.value.map((item) => Number(item.dueDate.slice(0, 4))))]
    .filter(Number.isFinite)
    .sort((a, b) => b - a),
);

const filteredReceivables = computed(() =>
  receivableRows.value.filter((receivable) => {
    if (receivableFilters.unitId && receivable.unit?.id !== receivableFilters.unitId) {
      return false;
    }
    if (receivableFilters.tenantName && receivable.tenantName !== receivableFilters.tenantName) {
      return false;
    }
    if (receivableFilters.year && receivable.dueDate.slice(0, 4) !== String(receivableFilters.year)) {
      return false;
    }
    if (receivableFilters.status && receivable.status !== receivableFilters.status) {
      return false;
    }
    return true;
  }),
);

watch(
  [() => form.paymentDate, () => form.contractId, () => form.amount],
  () => scheduleAllocationPreview(),
);

watch(dialogVisible, (visible) => {
  if (visible) {
    scheduleAllocationPreview();
  } else {
    invalidateAllocationPreview();
  }
});

onMounted(loadPageData);
onBeforeUnmount(invalidateAllocationPreview);

async function loadPageData() {
  try {
    loading.value = true;
    const [unitList, paymentList, receiptList, receivableList] = await Promise.all([
      unitsApi.list(),
      rentPaymentsApi.list(),
      receiptsApi.list(),
      rentReceivablesApi.list({}),
    ]);
    units.value = unitList;
    payments.value = paymentList;
    receipts.value = receiptList;
    receivables.value = receivableList.items;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载房租收费数据失败");
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  form.id = "";
  form.unitId = units.value[0]?.id ?? "";
  form.contractId = "";
  form.paymentDate = todayIso();
  form.amount = 0;
  form.method = "转账";
  form.note = "";
  existingVoucherFiles.value = [];
  voucherUploads.value = [];
  invalidateAllocationPreview();
}

function handleUnitChange() {
  const activeContract = selectedUnit.value?.activeContract;
  form.contractId = activeContract?.id ?? selectedContracts.value[0]?.id ?? "";
}

function openCreate() {
  resetForm();
  handleUnitChange();
  dialogVisible.value = true;
}

function openSchedulePayment(receivable: RentReceivableRow) {
  if (!receivable.unit || !receivable.contract || receivable.outstandingAmount <= 0) {
    return;
  }
  resetForm();
  form.unitId = receivable.unit.id;
  form.contractId = receivable.contract.id;
  form.amount = receivable.outstandingAmount;
  dialogVisible.value = true;
}

function resetPaymentFilters() {
  paymentFilters.unitId = "";
  paymentFilters.receiptStatus = "all";
  paymentFilters.keyword = "";
}

function resetReceivableFilters() {
  receivableFilters.unitId = "";
  receivableFilters.tenantName = "";
  receivableFilters.year = "";
  receivableFilters.status = "";
}

function openEdit(record: RentPayment) {
  form.id = record.id;
  form.unitId = record.unitId;
  form.contractId = record.contractId;
  form.paymentDate = record.paymentDate;
  form.amount = record.amount;
  form.method = record.method;
  form.note = record.note || "";
  existingVoucherFiles.value = [...record.attachmentFiles];
  voucherUploads.value = [];
  invalidateAllocationPreview();
  dialogVisible.value = true;
}

function closePaymentDialog() {
  dialogVisible.value = false;
}

function removeExistingVoucher(fileId: string) {
  existingVoucherFiles.value = existingVoucherFiles.value.filter((file) => file.id !== fileId);
}

function openVoucherPreview(files: StoredFile[]) {
  voucherPreviewFiles.value = files;
  voucherPreviewVisible.value = true;
}

function scheduleAllocationPreview() {
  const requestSequence = ++allocationPreviewRequestSequence;
  if (allocationPreviewTimer) {
    clearTimeout(allocationPreviewTimer);
    allocationPreviewTimer = undefined;
  }
  allocationPreview.value = null;
  allocationPreviewError.value = "";
  allocationPreviewLoading.value = false;

  const contractId = form.contractId;
  const paymentDate = form.paymentDate;
  const amount = Number(form.amount);
  const excludePaymentId = form.id || undefined;
  if (!dialogVisible.value || !contractId || !paymentDate || amount <= 0) {
    return;
  }

  allocationPreviewTimer = setTimeout(() => {
    allocationPreviewTimer = undefined;
    void refreshAllocationPreview(requestSequence, {
      contractId,
      paymentDate,
      amount,
      excludePaymentId,
    });
  }, PREVIEW_DEBOUNCE_MS);
}

async function refreshAllocationPreview(
  requestSequence: number,
  payload: {
    contractId: string;
    paymentDate: string;
    amount: number;
    excludePaymentId: string | undefined;
  },
) {
  try {
    allocationPreviewLoading.value = true;
    const result = await rentPaymentsApi.previewAllocation(payload);
    if (isCurrentAllocationPreviewRequest(requestSequence)) {
      allocationPreview.value = result;
    }
  } catch (error) {
    if (isCurrentAllocationPreviewRequest(requestSequence)) {
      allocationPreviewError.value = error instanceof Error ? error.message : "加载收款分配预览失败";
    }
  } finally {
    if (isCurrentAllocationPreviewRequest(requestSequence)) {
      allocationPreviewLoading.value = false;
    }
  }
}

function isCurrentAllocationPreviewRequest(requestSequence: number) {
  return requestSequence === allocationPreviewRequestSequence && dialogVisible.value;
}

function invalidateAllocationPreview() {
  allocationPreviewRequestSequence += 1;
  if (allocationPreviewTimer) {
    clearTimeout(allocationPreviewTimer);
    allocationPreviewTimer = undefined;
  }
  allocationPreview.value = null;
  allocationPreviewError.value = "";
  allocationPreviewLoading.value = false;
}

async function save() {
  if (submitting.value) {
    return;
  }

  try {
    submitting.value = true;
    let attachmentFileIds = existingVoucherFiles.value.map((file) => file.id);
    if (voucherUploads.value.length) {
      const uploaded = await filesApi.upload(voucherUploads.value, "payment-voucher");
      attachmentFileIds = [...attachmentFileIds, ...uploaded.map((file) => file.id)];
    }
    const payload = {
      contractId: form.contractId,
      paymentDate: form.paymentDate,
      amount: Number(form.amount),
      method: form.method.trim(),
      note: form.note.trim(),
      attachmentFileIds,
    };

    if (form.id) {
      await rentPaymentsApi.update(form.id, payload);
      ElMessage.success("房租收费已更新");
    } else {
      await rentPaymentsApi.create(payload);
      ElMessage.success("房租收费已新增");
    }

    closePaymentDialog();
    await loadPageData();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存房租收费失败");
  } finally {
    submitting.value = false;
  }
}

async function createReceipt(paymentId: string) {
  try {
    await receiptsApi.create({
      sourceType: "rent-payment",
      sourceId: paymentId,
    });
    ElMessage.success("收据已生成");
    await loadPageData();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "生成收据失败");
  }
}

function openReceiptPreview(fileId: string) {
  receiptPreviewFileId.value = fileId;
  receiptPreviewVisible.value = true;
}

async function confirmRemove(paymentId: string, closeDialog = false) {
  try {
    await ElMessageBox.confirm("确认删除这条房租收费记录吗？", "删除记录", { type: "warning" });
    await rentPaymentsApi.remove(paymentId);
    ElMessage.success("记录已删除");
    if (closeDialog) {
      closePaymentDialog();
    }
    await loadPageData();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "删除失败");
    }
  }
}

function receivableStatusLabel(status: RentReceivable["status"]) {
  if (status === "not-due") return "未到期";
  if (status === "partially-prepaid") return "部分预收";
  if (status === "prepaid") return "已预收";
  if (status === "overdue") return "欠费";
  return "已结清";
}

function receivableStatusTagType(
  status: RentReceivable["status"],
): "success" | "warning" | "info" | "danger" {
  if (status === "overdue") return "danger";
  if (status === "partially-prepaid") return "warning";
  if (status === "settled" || status === "prepaid") return "success";
  return "info";
}

function receivableBalanceLabel(receivable: RentReceivable) {
  if (receivable.prepaidAmount > 0) {
    return `预收 ${formatCurrency(receivable.prepaidAmount)}`;
  }
  if (receivable.outstandingAmount > 0) {
    return formatCurrency(receivable.outstandingAmount);
  }
  return "--";
}
</script>
