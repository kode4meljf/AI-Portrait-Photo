<template>
  <div class="page-card">
    <el-alert
      title="小程序充值页展示「已启用」的套餐；下单价格以保存时配置为准，已支付订单不受影响。"
      type="info"
      show-icon
      :closable="false"
      class="mb-16"
    />

    <div class="page-toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索名称 / 编号 / 标签"
        clearable
        style="width: 260px"
        @keyup.enter="search"
      />
      <el-button type="primary" @click="search">搜索</el-button>
      <el-button type="primary" plain @click="openCreate">新增套餐</el-button>
      <el-button plain @click="onSeedDefaults">初始化默认套餐</el-button>
      <span v-if="enabledCount !== null" class="enabled-tip">已启用 {{ enabledCount }} 个</span>
    </div>

    <el-table :data="list" v-loading="loading" stripe empty-text="暂无套餐，可点「初始化默认套餐」">
      <el-table-column prop="id" label="编号" width="72" />
      <el-table-column prop="name" label="名称" min-width="120" />
      <el-table-column prop="times" label="人次" width="80" align="center" />
      <el-table-column label="售价" width="100">
        <template #default="{ row }">¥{{ row.price }}</template>
      </el-table-column>
      <el-table-column label="原价" width="100">
        <template #default="{ row }">
          <span class="original">¥{{ row.originalPrice }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="tag" label="标签" width="100" show-overflow-tooltip />
      <el-table-column prop="expireDays" label="有效天数" width="92" align="center" />
      <el-table-column prop="sort" label="排序" width="72" align="center" />
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
            {{ row.enabled ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updateTimeText" label="更新时间" width="160" />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      background
      layout="total, prev, pager, next"
      :total="total"
      :page-size="pageSize"
      :current-page="page"
      @current-change="onPageChange"
    />

    <el-dialog
      v-model="dialogVisible"
      :title="isCreate ? '新增套餐' : '编辑套餐'"
      width="520px"
      destroy-on-close
    >
      <el-form :model="editForm" label-width="96px">
        <el-form-item v-if="!isCreate" label="编号">
          <el-input v-model="editForm.id" disabled />
        </el-form-item>
        <el-form-item v-else label="编号">
          <span class="muted">保存后自动分配</span>
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="editForm.name" placeholder="名称不可重复" />
        </el-form-item>
        <el-form-item label="人次" required>
          <el-input-number v-model="editForm.times" :min="1" :max="999999" :step="1" />
        </el-form-item>
        <el-form-item label="售价(元)" required>
          <el-input-number v-model="editForm.price" :min="0" :precision="2" :step="1" />
        </el-form-item>
        <el-form-item label="原价(元)" required>
          <el-input-number v-model="editForm.originalPrice" :min="0" :precision="2" :step="1" />
        </el-form-item>
        <el-form-item label="角标标签">
          <el-input v-model="editForm.tag" placeholder="如 推荐、限时5折" maxlength="16" />
        </el-form-item>
        <el-form-item label="有效天数" required>
          <el-input-number v-model="editForm.expireDays" :min="1" :max="3650" :step="1" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="editForm.sort" :min="0" :max="9999" :step="10" />
          <div class="form-tip">数值越大越靠前</div>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="editForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="savePackage">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api/admin'

const list = ref([])
const loading = ref(false)
const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const enabledCount = ref(null)
const dialogVisible = ref(false)
const saving = ref(false)
const isCreate = ref(false)
const editForm = ref({})

async function loadList() {
  loading.value = true
  try {
    const res = await api.listRechargePackages({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value
    })
    list.value = res.list || []
    total.value = res.total || 0
    enabledCount.value = res.enabledCount ?? null
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  loadList()
}

function onPageChange(p) {
  page.value = p
  loadList()
}

function openCreate() {
  isCreate.value = true
  const maxSort = list.value.reduce((m, r) => Math.max(m, Number(r.sort) || 0), 0)
  editForm.value = {
    name: '',
    times: 10,
    price: 0,
    originalPrice: 0,
    tag: '',
    expireDays: 30,
    sort: maxSort + 10,
    enabled: true
  }
  dialogVisible.value = true
}

function openEdit(row) {
  isCreate.value = false
  editForm.value = {
    _id: row._id,
    id: row.id,
    name: row.name,
    times: row.times,
    price: row.price,
    originalPrice: row.originalPrice,
    tag: row.tag || '',
    expireDays: row.expireDays != null ? row.expireDays : 30,
    sort: row.sort != null ? row.sort : 0,
    enabled: row.enabled !== false
  }
  dialogVisible.value = true
}

async function savePackage() {
  if (!(editForm.value.name || '').trim()) {
    ElMessage.warning('请填写套餐名称')
    return
  }
  saving.value = true
  try {
    if (isCreate.value) {
      await api.createRechargePackage({ ...editForm.value })
      ElMessage.success('已创建')
    } else {
      await api.updateRechargePackage({ ...editForm.value })
      ElMessage.success('已保存')
    }
    dialogVisible.value = false
    await loadList()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除套餐「${row.name}」？`, '提示', { type: 'warning' })
    await api.deleteRechargePackage({ _id: row._id })
    ElMessage.success('已删除')
    await loadList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

async function onSeedDefaults() {
  try {
    await ElMessageBox.confirm(
      '仅在云库尚无套餐时写入体验/标准/尊享三档默认数据，已有数据不会覆盖。',
      '初始化默认套餐',
      { type: 'info' }
    )
    const res = await api.seedRechargePackages()
    ElMessage.success(res.message || '操作完成')
    await loadList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '操作失败')
  }
}

onMounted(loadList)
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.enabled-tip {
  margin-left: 12px;
  font-size: 13px;
  color: #909399;
}

.original {
  color: #909399;
  text-decoration: line-through;
}

.pager {
  margin-top: 16px;
  justify-content: flex-end;
}

.form-tip,
.muted {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
