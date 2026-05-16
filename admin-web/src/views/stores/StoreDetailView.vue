<template>
  <div class="page-card" v-loading="loading">
    <el-page-header @back="$router.back()" content="门店详情" />

    <el-form
      v-if="form"
      :model="form"
      label-width="100px"
      class="detail-form"
    >
      <el-form-item label="门店 ID">
        <el-input v-model="form._id" disabled />
      </el-form-item>
      <el-form-item label="门店名称">
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="联系人">
        <el-input v-model="form.contactName" />
      </el-form-item>
      <el-form-item label="联系电话">
        <el-input v-model="form.contactPhone" />
      </el-form-item>
      <el-form-item label="地址">
        <el-input v-model="form.address" type="textarea" :rows="2" />
      </el-form-item>
      <el-form-item label="会员等级">
        <el-input v-model="form.level" />
      </el-form-item>
      <el-form-item label="账户余额">
        <el-input-number v-model="form.balance" :min="0" />
      </el-form-item>
      <el-form-item label="套餐总量">
        <el-input-number v-model="form.packageTotal" :min="0" />
      </el-form-item>
      <el-form-item label="已用套餐">
        <el-input-number v-model="form.packageUsed" :min="0" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '@/api/admin'

const route = useRoute()
const loading = ref(false)
const saving = ref(false)
const form = ref(null)

async function loadDetail() {
  loading.value = true
  try {
    form.value = await api.getStore(route.params.id)
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const data = await api.updateStore({ ...form.value, storeId: form.value._id })
    form.value = data
    ElMessage.success('保存成功')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

onMounted(loadDetail)
</script>

<style scoped>
.detail-form {
  max-width: 560px;
  margin-top: 20px;
}
</style>
