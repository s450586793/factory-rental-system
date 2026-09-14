<template>
  <el-dialog :model-value="modelValue" title="合同金额历史" width="820px" @update:model-value="emit('update:modelValue', $event)">
    <div v-if="loading" role="status">正在加载金额历史</div>
    <div v-else-if="error" role="alert">
      {{ error }}
      <el-button @click="loadHistory">重新加载</el-button>
    </div>
    <el-table v-else :data="history" empty-text="暂无金额变更记录" size="small">
      <el-table-column label="时间" min-width="170">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作者" min-width="100">
        <template #default="{ row }">{{ row.actorUsername || '系统' }}</template>
      </el-table-column>
      <el-table-column label="字段" min-width="140">
        <template #default="{ row }">{{ fieldLabels[row.field as keyof typeof fieldLabels] || row.field }}</template>
      </el-table-column>
      <el-table-column label="修改前" min-width="110">
        <template #default="{ row }">{{ row.beforeValue === null ? '新建' : row.beforeValue }}</template>
      </el-table-column>
      <el-table-column prop="afterValue" label="修改后" min-width="110" />
    </el-table>
    <template #footer><el-button @click="emit('update:modelValue', false)">关闭</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { contractsApi } from "../../../api";
import type { ContractFinancialHistory } from "../../../types/models";

const props = defineProps<{ modelValue: boolean; contractId: string }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
const loading = ref(false);
const error = ref("");
const history = ref<ContractFinancialHistory[]>([]);
let requestSequence = 0;
const fieldLabels = {
  annualRent: "年租金（元）",
  depositAmount: "押金（元）",
  electricUnitPrice: "电费单价（元/度）",
  electricLineLossPercent: "电费线损（%）",
  waterUnitPrice: "水费单价（元/吨）",
  earlyTerminationPenaltyAmount: "提前退租违约金（元）",
};

async function loadHistory() {
  const sequence = ++requestSequence;
  history.value = [];
  error.value = "";
  if (!props.modelValue || !props.contractId) return;
  loading.value = true;
  try {
    const result = await contractsApi.history(props.contractId);
    if (sequence === requestSequence) history.value = result;
  } catch (failure) {
    if (sequence === requestSequence) error.value = failure instanceof Error ? failure.message : "加载金额历史失败";
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "medium",
  }).format(new Date(value));
}

watch(() => [props.modelValue, props.contractId], loadHistory, { immediate: true });
onBeforeUnmount(() => { requestSequence += 1; });
</script>
