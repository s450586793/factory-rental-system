<template>
        <h4 class="contract-party-heading">甲方信息</h4>
        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="甲方名称">
              <el-input v-model="form.lessorName" :aria-label="aria('甲方名称')" placeholder="个人姓名或公司名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="甲方营业执照代码">
              <el-input
                v-model="form.lessorLicenseCode"
                :aria-label="aria('甲方营业执照代码')"
                placeholder="个人出租可留空"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="甲方联系人">
              <el-input v-model="form.lessorContactName" :aria-label="aria('甲方联系人')" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="甲方电话">
              <el-input v-model="form.lessorPhone" :aria-label="aria('甲方电话')" />
            </el-form-item>
          </el-col>
        </el-row>

        <h4 class="contract-party-heading">乙方信息</h4>
          <el-row :gutter="14">
            <el-col :span="12">
            <el-form-item label="乙方名称">
              <el-input v-model="form.tenantName" :aria-label="aria('乙方名称')" :placeholder="initial ? '个人姓名或公司名称' : undefined" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="乙方营业执照代码">
              <el-input v-model="form.licenseCode" :aria-label="aria('乙方营业执照代码')" :placeholder="initial ? '统一社会信用代码' : undefined" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="乙方联系人">
              <el-input v-model="form.contactName" :aria-label="aria('乙方联系人')" :placeholder="initial ? '例如 林建生' : undefined" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="乙方电话">
              <el-input v-model="form.tenantPhone" :aria-label="aria('乙方电话')" :placeholder="initial ? '例如 13800000000' : undefined" />
            </el-form-item>
          </el-col>
        </el-row>

        <h4 class="contract-party-heading">合同与安全协议</h4>
        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="甲方安全管理负责人">
              <el-input
                v-model="form.lessorSafetyManager"
                :aria-label="aria('甲方安全管理负责人')"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="乙方安全管理负责人">
              <el-input
                v-model="form.tenantSafetyManager"
                :aria-label="aria('乙方安全管理负责人')"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="合同签订日期">
              <el-date-picker
                v-model="form.signedDate"
                :aria-label="aria('合同签订日期')"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="提前退租违约金">
              <el-input-number
                v-model="form.earlyTerminationPenaltyAmount"
                :aria-label="aria('提前退租违约金')"
                :min="0"
                :precision="2"
                style="width: 100%"
                @update:model-value="emit('penaltyChange')"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="合同开始">
              <el-date-picker
                v-model="form.startDate"
                :aria-label="aria('合同开始')"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
                @change="emit('startChange')"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="合同结束">
              <el-date-picker
                v-model="form.endDate"
                :aria-label="aria('合同结束')"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="年租金">
              <el-input-number
                v-model="form.annualRent"
                :aria-label="aria('年租金')"
                :min="0"
                :precision="2"
                style="width: 100%"
                @update:model-value="emit('annualRentChange', $event)"
              />
              <el-radio-group
                v-model="form.billingFrequency"
                class="billing-frequency-control"
                :disabled="initial"
                :aria-label="aria('收租周期')"
              >
                <el-radio-button label="annual" :aria-label="aria('收租周期-按年')">按年</el-radio-button>
                <el-radio-button label="semiannual" :aria-label="aria('收租周期-按半年')">按半年</el-radio-button>
              </el-radio-group>
              <div v-if="preview.count" class="schedule-preview-line">
                <span>预计 {{ preview.count }} 期</span>
                <span>首期到期日 {{ preview.firstDueDate }}</span>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="押金">
              <el-input-number
                v-model="form.depositAmount"
                :aria-label="aria('押金')"
                :min="0"
                :precision="2"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="8">
            <el-form-item label="电费单价（元/度）">
              <el-input-number
                v-model="form.electricUnitPrice"
                :aria-label="aria('电费单价（元/度）')"
                :min="0"
                :precision="4"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="电费线损（%）">
              <el-input-number
                v-model="form.electricLineLossPercent"
                :aria-label="aria('电费线损（%）')"
                :min="0"
                :precision="2"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="水费单价（元/吨）">
              <el-input-number
                v-model="form.waterUnitPrice"
                :aria-label="aria('水费单价（元/吨）')"
                :min="0"
                :precision="4"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

</template>

<script setup lang="ts">
import type { ContractFormFields } from "./contract-form";

const props = defineProps<{
  form: ContractFormFields;
  initial?: boolean;
  preview: { count: number; firstDueDate: string | null };
}>();
const emit = defineEmits<{
  startChange: [];
  annualRentChange: [value: number | undefined];
  penaltyChange: [];
}>();

function aria(label: string) {
  return props.initial ? `初始合同${label.startsWith("合同") ? label.slice(2) : label}` : label;
}
</script>
