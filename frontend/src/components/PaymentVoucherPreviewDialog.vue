<template>
  <el-dialog :model-value="modelValue" :title="title" width="760px" @update:model-value="emit('update:modelValue', $event)">
    <div class="payment-voucher-preview-grid">
      <a
        v-for="(file, index) in files"
        :key="file.id"
        class="payment-voucher-preview-item"
        :href="apiFileUrl(file.id)"
        target="_blank"
        rel="noopener"
      >
        <img :src="apiFileUrl(file.id)" :alt="`${title} ${index + 1}`" />
        <span>{{ file.originalName || `收款凭证 ${index + 1}` }}</span>
      </a>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { apiFileUrl } from "../api/client";
import type { StoredFile } from "../types/models";

defineProps<{
  modelValue: boolean;
  files: StoredFile[];
  title: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [visible: boolean];
}>();
</script>
