<template>
  <AppShell>
    <section class="panel-card page-panel">
      <div class="page-header">
        <div>
          <h2>押金记录</h2>
          <p>分别记录押金收取与退还，和合同留档关联。</p>
        </div>
        <div class="toolbar-row">
          <el-button type="primary" @click="openCreate">新增押金记录</el-button>
          <el-button @click="loadPageData">刷新</el-button>
        </div>
      </div>

      <el-table :data="records" v-loading="loading">
        <el-table-column label="厂房" min-width="120">
          <template #default="{ row }">
            {{ row.unit.code }}
          </template>
        </el-table-column>
        <el-table-column prop="tenantNameSnapshot" label="租户" min-width="180" />
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag :type="row.type === 'received' ? 'success' : 'warning'">
              {{ row.type === "received" ? "收取" : "退还" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="paymentDate" label="日期" min-width="120" />
        <el-table-column label="金额" min-width="140">
          <template #default="{ row }">
            {{ formatCurrency(row.amount) }}
          </template>
        </el-table-column>
        <el-table-column prop="method" label="方式" min-width="120" />
        <el-table-column label="备注" min-width="180">
          <template #default="{ row }">
            {{ row.note || "--" }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-space wrap>
              <el-button text @click="openEdit(row)">编辑</el-button>
              <el-button text type="danger" @click="confirmRemove(row.id)">删除</el-button>
            </el-space>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑押金记录' : '新增押金记录'" width="640px">
      <el-form label-position="top">
        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="厂房">
              <el-select v-model="form.unitId" style="width: 100%" @change="handleUnitChange">
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
            <el-form-item label="合同">
              <el-select v-model="form.contractId" style="width: 100%">
                <el-option
                  v-for="contract in selectedContracts"
                  :key="contract.id"
                  :label="`${contract.tenantName} (${contract.startDate}~${contract.endDate})`"
                  :value="contract.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="类型">
              <el-select v-model="form.type" style="width: 100%">
                <el-option label="收取押金" value="received" />
                <el-option label="退还押金" value="refunded" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="日期">
              <el-date-picker v-model="form.paymentDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="金额">
              <el-input-number v-model="form.amount" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="方式">
              <el-input v-model="form.method" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AppShell from "../components/AppShell.vue";
import { depositsApi, unitsApi } from "../api";
import type { Contract, DepositRecord, UnitSummary } from "../types/models";
import { formatCurrency, todayIso } from "../utils/format";

const loading = ref(false);
const dialogVisible = ref(false);
const submitting = ref(false);
const units = ref<UnitSummary[]>([]);
const records = ref<DepositRecord[]>([]);

const form = reactive({
  id: "",
  unitId: "",
  contractId: "",
  type: "received" as "received" | "refunded",
  paymentDate: todayIso(),
  amount: 0,
  method: "转账",
  note: "",
});

const selectedUnit = computed(() => units.value.find((item) => item.id === form.unitId) || null);
const selectedContracts = computed<Contract[]>(() => selectedUnit.value?.contracts ?? []);

onMounted(loadPageData);

async function loadPageData() {
  try {
    loading.value = true;
    const [unitList, depositList] = await Promise.all([unitsApi.list(), depositsApi.list()]);
    units.value = unitList;
    records.value = depositList;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载押金记录失败");
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  form.id = "";
  form.unitId = units.value[0]?.id ?? "";
  form.contractId = "";
  form.type = "received";
  form.paymentDate = todayIso();
  form.amount = 0;
  form.method = "转账";
  form.note = "";
}

function handleUnitChange() {
  form.contractId = selectedUnit.value?.activeContract?.id || selectedContracts.value[0]?.id || "";
}

function openCreate() {
  resetForm();
  handleUnitChange();
  dialogVisible.value = true;
}

function openEdit(record: DepositRecord) {
  form.id = record.id;
  form.unitId = record.unitId;
  form.contractId = record.contractId;
  form.type = record.type;
  form.paymentDate = record.paymentDate;
  form.amount = record.amount;
  form.method = record.method;
  form.note = record.note || "";
  dialogVisible.value = true;
}

async function save() {
  try {
    submitting.value = true;
    const payload = {
      contractId: form.contractId,
      type: form.type,
      paymentDate: form.paymentDate,
      amount: Number(form.amount),
      method: form.method.trim(),
      note: form.note.trim(),
    };

    if (form.id) {
      await depositsApi.update(form.id, payload);
      ElMessage.success("押金记录已更新");
    } else {
      await depositsApi.create(payload);
      ElMessage.success("押金记录已新增");
    }

    dialogVisible.value = false;
    await loadPageData();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存押金记录失败");
  } finally {
    submitting.value = false;
  }
}

async function confirmRemove(recordId: string) {
  try {
    await ElMessageBox.confirm("确认删除这条押金记录吗？", "删除记录", { type: "warning" });
    await depositsApi.remove(recordId);
    ElMessage.success("记录已删除");
    await loadPageData();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "删除失败");
    }
  }
}
</script>
