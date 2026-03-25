<template>
  <div class="login-shell">
    <div class="panel-card login-card">
      <section class="login-aside">
        <div class="brand-mark">Factory Rental v1</div>
        <h1>把厂房、合同、水电和收款收据放进一个后台</h1>
        <p>
          这个版本面向单超级用户管理，适合部署到群晖 Docker 中，附件、账务记录和收据 PDF 都会留痕。
        </p>
      </section>

      <section class="login-panel">
        <div class="brand-mark" style="color: var(--brand-deep)">Super Admin</div>
        <h1>登录系统</h1>
        <p style="color: var(--muted)">使用环境变量初始化的超级账号进入后台。</p>

        <el-form label-position="top" @submit.prevent="handleSubmit">
          <el-form-item label="用户名">
            <el-input v-model="form.username" placeholder="请输入管理员用户名" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.password" type="password" show-password placeholder="请输入密码" />
          </el-form-item>
          <el-button type="primary" size="large" :loading="submitting" @click="handleSubmit">进入后台</el-button>
        </el-form>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const submitting = ref(false);
const form = reactive({
  username: "",
  password: "",
});

async function handleSubmit() {
  try {
    submitting.value = true;
    await authStore.login(form.username.trim(), form.password);
    ElMessage.success("登录成功");
    router.push(String(route.query.redirect || "/units"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "登录失败");
  } finally {
    submitting.value = false;
  }
}
</script>
