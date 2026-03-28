<template>
  <AppShell>
    <template #top-actions>
      <div class="toolbar-row">
        <el-button type="primary" @click="openCreateRecord">新增水电收费</el-button>
        <el-button @click="loadPageData">刷新</el-button>
      </div>
    </template>

    <section class="panel-card page-panel">
      <div class="page-header">
        <div>
          <h2>水电收费记录</h2>
          <p>按厂房和合同录入多电表/多水表抄表结果，系统自动汇总金额。</p>
        </div>
      </div>

      <el-table :data="records" v-loading="loading">
        <el-table-column label="厂房" min-width="120">
          <template #default="{ row }">
            {{ row.unit.code }}
          </template>
        </el-table-column>
        <el-table-column label="租户" min-width="180">
          <template #default="{ row }">
            {{ row.tenantNameSnapshot }}
          </template>
        </el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            {{ row.type === "electric" ? "电费" : "水费" }}
          </template>
        </el-table-column>
        <el-table-column label="抄表周期" min-width="220">
          <template #default="{ row }">
            {{ row.previousReadAt }} 至 {{ row.currentReadAt }}
          </template>
        </el-table-column>
        <el-table-column label="总用量" min-width="120">
          <template #default="{ row }">
            {{ row.totalUsage.toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column label="调整后用量" min-width="140">
          <template #default="{ row }">
            {{ row.adjustedUsage.toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column label="金额" min-width="150">
          <template #default="{ row }">
            {{ formatCurrency(row.amount) }}
          </template>
        </el-table-column>
        <el-table-column label="缴费状态" width="110">
          <template #default="{ row }">
            <el-tag :type="row.status === 'paid' ? 'success' : 'warning'">
              {{ row.status === "paid" ? "已缴费" : "未缴费" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="录入日期" min-width="120">
          <template #default="{ row }">
            {{ row.recordedAt }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" :fixed="actionColumnFixed">
          <template #default="{ row }">
            <el-space wrap>
              <el-button text type="primary" @click="openViewRecord(row)">查看</el-button>
              <el-button text @click="openEditRecord(row)">编辑</el-button>
              <el-button
                v-if="row.status === 'unpaid'"
                text
                type="success"
                @click="markRecordPaid(row.id)"
              >
                标记已缴费
              </el-button>
              <el-button
                v-if="row.status === 'paid'"
                text
                type="primary"
                @click="createReceipt(row.id)"
              >
                开收据
              </el-button>
              <el-button text type="danger" @click="confirmRemoveRecord(row.id)">删除</el-button>
            </el-space>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="920px">
      <el-form label-position="top">
        <el-row :gutter="14">
          <el-col :span="8">
            <el-form-item label="厂房">
              <el-select v-model="form.unitId" style="width: 100%" :disabled="isViewMode" @change="handleUnitChange">
                <el-option v-for="unit in units" :key="unit.id" :label="`${unit.code} / ${unit.location}`" :value="unit.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="合同">
              <el-select v-model="form.contractId" style="width: 100%" :disabled="isViewMode">
                <el-option
                  v-for="contract in selectedContracts"
                  :key="contract.id"
                  :label="`${contract.tenantName} (${contract.startDate}~${contract.endDate})`"
                  :value="contract.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="费用类型">
              <el-select v-model="form.type" style="width: 100%" :disabled="isViewMode" @change="handleTypeChange">
                <el-option label="电费" value="electric" />
                <el-option label="水费" value="water" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="上次抄表日期">
              <el-date-picker
                v-model="form.previousReadAt"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
                :disabled="isViewMode"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="本次抄表日期">
              <el-date-picker
                v-model="form.currentReadAt"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
                :disabled="isViewMode"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-table :data="form.items" style="margin-bottom: 16px">
          <el-table-column label="表计" min-width="160">
            <template #default="{ row }">
              {{ row.name }}
            </template>
          </el-table-column>
          <el-table-column label="倍率" min-width="100">
            <template #default="{ row }">
              {{ row.multiplier }}
            </template>
          </el-table-column>
          <el-table-column label="单价" min-width="100">
            <template #default="{ row }">
              {{ row.unitPrice }}
            </template>
          </el-table-column>
          <el-table-column label="线损%" min-width="100">
            <template #default="{ row }">
              {{ row.lineLossPercent }}
            </template>
          </el-table-column>
          <el-table-column label="上次读数" min-width="140">
            <template #default="{ row }">
              <el-input-number
                v-model="row.previousReading"
                :precision="2"
                :min="0"
                style="width: 100%"
                :disabled="isViewMode"
              />
            </template>
          </el-table-column>
          <el-table-column label="本次读数" min-width="140">
            <template #default="{ row }">
              <el-input-number
                v-model="row.currentReading"
                :precision="2"
                :min="0"
                style="width: 100%"
                :disabled="isViewMode"
              />
            </template>
          </el-table-column>
          <el-table-column label="用量" min-width="120">
            <template #default="{ row }">
              {{ calculateItemUsage(row).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="金额" min-width="150">
            <template #default="{ row }">
              {{ formatCurrency(calculateItemAmount(row)) }}
            </template>
          </el-table-column>
        </el-table>

        <section class="detail-section">
          <h3>本次汇总</h3>
          <div class="stats-row">
            <div class="stat-item">
              <small>总用量</small>
              <strong>{{ totalUsage.toFixed(2) }}</strong>
            </div>
            <div class="stat-item">
              <small>调整后用量</small>
              <strong>{{ adjustedUsage.toFixed(2) }}</strong>
            </div>
            <div class="stat-item">
              <small>应收金额</small>
              <strong>{{ formatCurrency(totalAmount) }}</strong>
            </div>
            <div class="stat-item">
              <small>表计数量</small>
              <strong>{{ form.items.length }}</strong>
            </div>
          </div>
        </section>

        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="3" :disabled="isViewMode" />
        </el-form-item>
      </el-form>

      <template #footer>
        <template v-if="isViewMode">
          <el-button @click="dialogVisible = false">关闭</el-button>
          <el-button type="primary" @click="switchToEdit">修改</el-button>
          <el-button type="danger" @click="removeCurrentRecord">删除</el-button>
        </template>
        <template v-else>
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="saveRecord">保存</el-button>
        </template>
      </template>
    </el-dialog>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AppShell from "../components/AppShell.vue";
import { receiptsApi, unitsApi, utilitiesApi } from "../api";
import { useViewportWidth } from "../composables/useViewportWidth";
import type { Contract, UnitSummary, UtilityChargeRecord } from "../types/models";
import { formatCurrency, todayIso } from "../utils/format";

type EditableItem = {
  meterConfigId: string;
  name: string;
  multiplier: number;
  unitPrice: number;
  lineLossPercent: number;
  previousReading: number;
  currentReading: number;
};

const loading = ref(false);
const submitting = ref(false);
const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit" | "view">("create");
const units = ref<UnitSummary[]>([]);
const records = ref<UtilityChargeRecord[]>([]);
const viewportWidth = useViewportWidth();

const form = reactive({
  id: "",
  unitId: "",
  contractId: "",
  type: "electric" as "electric" | "water",
  previousReadAt: "",
  currentReadAt: todayIso(),
  note: "",
  items: [] as EditableItem[],
});

const selectedUnit = computed(() => units.value.find((item) => item.id === form.unitId) || null);
const selectedContracts = computed<Contract[]>(() => selectedUnit.value?.contracts ?? []);
const isViewMode = computed(() => dialogMode.value === "view");
const actionColumnFixed = computed<false | "right">(() => (viewportWidth.value < 768 ? false : "right"));
const dialogTitle = computed(() => {
  if (dialogMode.value === "view") return "查看水电收费";
  return form.id ? "编辑水电收费" : "新增水电收费";
});

const totalUsage = computed(() =>
  form.items.reduce((sum, item) => sum + calculateItemUsage(item), 0),
);
const adjustedUsage = computed(() =>
  form.items.reduce((sum, item) => sum + calculateItemAdjustedUsage(item), 0),
);
const totalAmount = computed(() =>
  form.items.reduce((sum, item) => sum + calculateItemAmount(item), 0),
);

onMounted(loadPageData);

async function loadPageData() {
  try {
    loading.value = true;
    const [unitList, recordList] = await Promise.all([unitsApi.list(), utilitiesApi.listRecords()]);
    units.value = unitList;
    records.value = recordList;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载水电记录失败");
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  form.id = "";
  form.unitId = units.value[0]?.id ?? "";
  form.contractId = "";
  form.type = "electric";
  form.previousReadAt = "";
  form.currentReadAt = todayIso();
  form.note = "";
  form.items = [];
}

async function openCreateRecord() {
  resetForm();
  dialogMode.value = "create";
  dialogVisible.value = true;
  await handleUnitChange();
}

async function handleUnitChange() {
  form.contractId = selectedUnit.value?.activeContract?.id || selectedContracts.value[0]?.id || "";
  await loadPrefill();
}

async function handleTypeChange() {
  await loadPrefill();
}

async function loadPrefill() {
  if (!form.unitId) {
    form.items = [];
    return;
  }

  try {
    const payload = await utilitiesApi.prefill(form.unitId, form.type);
    form.items = payload.meters.map((item) => ({
      meterConfigId: item.meterConfigId,
      name: item.name,
      multiplier: item.multiplier,
      unitPrice: item.unitPrice,
      lineLossPercent: item.lineLossPercent,
      previousReading: item.previousReading,
      currentReading: item.previousReading,
    }));
    form.previousReadAt = payload.meters[0]?.previousReadAt || todayIso();
    form.currentReadAt = todayIso();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载表计预填失败");
  }
}

function openEditRecord(record: UtilityChargeRecord) {
  dialogMode.value = "edit";
  form.id = record.id;
  form.unitId = record.unitId;
  form.contractId = record.contractId;
  form.type = record.type;
  form.previousReadAt = record.previousReadAt;
  form.currentReadAt = record.currentReadAt;
  form.note = record.note || "";
  form.items = record.items.map((item) => ({
    meterConfigId: item.meterConfigId,
    name: item.meterNameSnapshot,
    multiplier: item.multiplierSnapshot,
    unitPrice: item.unitPriceSnapshot,
    lineLossPercent: item.lineLossPercentSnapshot,
    previousReading: item.previousReading,
    currentReading: item.currentReading,
  }));
  dialogVisible.value = true;
}

function openViewRecord(record: UtilityChargeRecord) {
  openEditRecord(record);
  dialogMode.value = "view";
}

function switchToEdit() {
  dialogMode.value = "edit";
}

async function saveRecord() {
  if (isViewMode.value) return;
  try {
    submitting.value = true;
    const payload = {
      unitId: form.unitId,
      contractId: form.contractId,
      type: form.type,
      previousReadAt: form.previousReadAt,
      currentReadAt: form.currentReadAt,
      note: form.note.trim(),
      items: form.items.map((item) => ({
        meterConfigId: item.meterConfigId,
        previousReading: Number(item.previousReading),
        currentReading: Number(item.currentReading),
      })),
    };

    if (form.id) {
      await utilitiesApi.updateRecord(form.id, payload);
      ElMessage.success("水电记录已更新");
    } else {
      await utilitiesApi.createRecord(payload);
      ElMessage.success("水电记录已新增");
    }
    dialogVisible.value = false;
    await loadPageData();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存水电记录失败");
  } finally {
    submitting.value = false;
  }
}

async function removeCurrentRecord() {
  if (!form.id) return;
  await confirmRemoveRecord(form.id);
  dialogVisible.value = false;
}

async function markRecordPaid(recordId: string) {
  try {
    await utilitiesApi.payRecord(recordId, { paidAt: todayIso() });
    ElMessage.success("已标记为已缴费");
    await loadPageData();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "更新状态失败");
  }
}

async function createReceipt(recordId: string) {
  try {
    await receiptsApi.create({
      sourceType: "utility",
      sourceId: recordId,
      issueDate: todayIso(),
    });
    ElMessage.success("收据已生成");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "生成收据失败");
  }
}

async function confirmRemoveRecord(recordId: string) {
  try {
    await ElMessageBox.confirm("确认删除这条水电收费记录吗？", "删除记录", { type: "warning" });
    await utilitiesApi.removeRecord(recordId);
    ElMessage.success("记录已删除");
    await loadPageData();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "删除失败");
    }
  }
}

function calculateItemUsage(item: EditableItem) {
  return Math.max(0, (item.currentReading - item.previousReading) * item.multiplier);
}

function calculateItemAdjustedUsage(item: EditableItem) {
  return calculateItemUsage(item) * (1 + item.lineLossPercent / 100);
}

function calculateItemAmount(item: EditableItem) {
  return calculateItemAdjustedUsage(item) * item.unitPrice;
}
</script>
