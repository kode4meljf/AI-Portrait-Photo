<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">AI写真馆</h1>
      <p class="login-subtitle">门店运营后台</p>
      <el-form ref="formRef" :model="form" :rules="rules" @submit.prevent="onSubmit">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" size="large" prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
            prefix-icon="Lock"
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-button
          type="primary"
          size="large"
          style="width: 100%"
          :loading="loading"
          @click="onSubmit"
        >
          登录
        </el-button>
      </el-form>
      <p v-if="useMock" class="mock-tip">当前为 Mock 模式，默认账号 admin / admin123</p>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const useMock = import.meta.env.VITE_USE_MOCK === 'true'
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const formRef = ref()
const loading = ref(false)

const form = reactive({
  username: 'admin',
  password: 'admin123'
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function onSubmit() {
  await formRef.value?.validate()
  loading.value = true
  try {
    await auth.login(form.username, form.password)
    ElMessage.success('登录成功')
    router.replace(route.query.redirect || '/dashboard')
  } catch (e) {
    ElMessage.error(e.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.mock-tip {
  margin-top: 16px;
  font-size: 12px;
  color: #909399;
  text-align: center;
}

:deep(.el-button--primary) {
  --el-button-bg-color: var(--admin-primary);
  --el-button-border-color: var(--admin-primary);
  --el-button-hover-bg-color: var(--admin-primary-dark);
  --el-button-hover-border-color: var(--admin-primary-dark);
}
</style>
