<template>
  <div class="payment-voucher-upload">
    <input
      ref="fileInput"
      class="payment-voucher-file-input"
      type="file"
      :accept="PAYMENT_VOUCHER_IMAGE_ACCEPT"
      multiple
      :disabled="disabled"
      @change="onFileInputChange"
    />

    <div
      class="payment-voucher-dropzone"
      :class="{ 'is-dragging': isDragging, 'is-disabled': disabled }"
      role="button"
      :tabindex="disabled ? -1 : 0"
      :aria-disabled="disabled"
      aria-label="选择收款凭证图片"
      @click="openFilePicker"
      @keydown.enter.prevent="openFilePicker"
      @keydown.space.prevent="openFilePicker"
      @dragenter.prevent="isDragging = true"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
    >
      <span>收款凭证图片</span>
      <strong>已选择 {{ selectedCount }} / {{ MAX_PAYMENT_VOUCHER_IMAGES }} 张</strong>
    </div>

    <div v-if="existingFiles.length || modelValue.length" class="payment-voucher-file-list">
      <div v-for="file in existingFiles" :key="file.id" class="payment-voucher-file-row" :data-file-id="file.id">
        <span class="payment-voucher-file-name">{{ file.originalName }}</span>
        <el-button text type="danger" :disabled="disabled" @click.stop="removeExistingFile(file.id)">移除</el-button>
      </div>
      <div
        v-for="(file, index) in modelValue"
        :key="`${file.name}-${file.size}-${index}`"
        class="payment-voucher-file-row"
        :data-pending-index="index"
      >
        <span class="payment-voucher-file-name">{{ file.name }}</span>
        <el-button text type="danger" :disabled="disabled" @click.stop="removePendingFile(index)">移除</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import type { StoredFile } from "../types/models";
import {
  appendPaymentVoucherImages,
  MAX_PAYMENT_VOUCHER_IMAGES,
  PAYMENT_VOUCHER_IMAGE_ACCEPT,
} from "../utils/payment-vouchers";

type PaymentVoucherExistingFile = Pick<StoredFile, "id" | "originalName">;

const props = withDefaults(
  defineProps<{
    modelValue: File[];
    existingFiles: PaymentVoucherExistingFile[];
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [files: File[]];
  "remove-existing": [fileId: string];
}>();

const fileInput = ref<HTMLInputElement>();
const isDragging = ref(false);
const selectedCount = computed(() => props.existingFiles.length + props.modelValue.length);

function openFilePicker() {
  if (!props.disabled) {
    fileInput.value?.click();
  }
}

function appendFiles(files: FileList | File[]) {
  if (props.disabled || files.length === 0) {
    return;
  }

  try {
    emit(
      "update:modelValue",
      appendPaymentVoucherImages(props.existingFiles.length, props.modelValue, files),
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "收款凭证选择失败");
  }
}

function onFileInputChange(event: Event) {
  const target = event.target as HTMLInputElement;
  appendFiles(target.files ?? []);
  target.value = "";
}

function onDrop(event: DragEvent) {
  isDragging.value = false;
  appendFiles(event.dataTransfer?.files ?? []);
}

function removeExistingFile(fileId: string) {
  if (!props.disabled) {
    emit("remove-existing", fileId);
  }
}

function removePendingFile(index: number) {
  if (!props.disabled) {
    emit(
      "update:modelValue",
      props.modelValue.filter((_, currentIndex) => currentIndex !== index),
    );
  }
}
</script>
