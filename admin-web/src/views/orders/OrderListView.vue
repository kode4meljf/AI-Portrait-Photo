<template>
  <div class="page-card">
    <el-alert
      v-if="!appStore.currentStoreId"
      title="请先在右上角选择门店，再管理订单"
      type="warning"
      show-icon
      :closable="false"
      class="mb-16"
    />

    <el-tabs v-model="statusTab" @tab-change="onTabChange">
      <el-tab-pane
        v-for="tab in tabs"
        :key="tab.value"
        :label="`${tab.label}${tab.count != null ? ` (${tab.count})` : ''}`"
        :name="tab.value"
      />
    </el-tabs>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="orderNo" label="订单号" min-width="150" />
      <el-table-column prop="customerName" label="客户" width="100" />
      <el-table-column prop="frameName" label="相框" min-width="120" />
      <el-table-column label="规格" min-width="140">
        <template #default="{ row }">{{ row.size }} · {{ row.material }}</template>
      </el-table-column>
      <el-table-column prop="price" label="金额" width="90" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createTimeText" label="创建时间" min-width="160" />
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <div class="table-actions">
            <el-dropdown trigger="click" @command="(cmd) => changeStatus(row, cmd)">
              <el-button link type="primary">改状态</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="s in ORDER_STATUSES"
                    :key="s"
                    :command="s"
                    :disabled="s === row.status"
                  >
                    {{ s }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button
              link
              type="danger"
              :loading="deletingId === row._id"
              @click="onDelete(row)"
            >
              删除
            </el-button>
          </div>
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
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api/admin'
import { useAppStore } from '@/stores/app'

const ORDER_STATUSES = ['待处理', '制作中', '已发货', '已完成']
const appStore = useAppStore()

const tabs = ref([
  { label: '全部', value: 'all', count: 0 },
  { label: '待处理', value: '待处理', count: 0 },
  { label: '制作中', value: '制作中', count: 0 },
  { label: '已发货', value: '已发货', count: 0 },
  { label: '已完成', value: '已完成', count: 0 }
])

const statusTab = ref('all')
const list = ref([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const deletingId = ref('')

function statusTagType(status) {
  const map = {
    待处理: 'info',
    制作中: 'warning',
    已发货: '',
    已完成: 'success'
  }
  return map[status] || 'info'
}

async function loadCounts() {
  if (!appStore.currentStoreId) return
  try {
    const counts = await api.getOrderStatusCounts({ storeId: appStore.currentStoreId })
    tabs.value = tabs.value.map((t) => ({
      ...t,
      count: t.value === 'all' ? counts.all : counts[t.value] || 0
    }))
  } catch {
    /* ignore */
  }
}

async function loadList() {
  if (!appStore.currentStoreId) {
    list.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const res = await api.listOrders({
      storeId: appStore.currentStoreId,
      status: statusTab.value,
      page: page.value,
      pageSize: pageSize.value
    })
    list.value = res.list || []
    total.value = res.total || 0
    await loadCounts()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function onTabChange() {
  page.value = 1
  loadList()
}

function onPageChange(p) {
  page.value = p
  loadList()
}

async function changeStatus(row, status) {
  try {
    if (status === '已发货') {
      const { value } = await ElMessageBox.prompt('请输入物流单号（可选）', '发货', {
        confirmButtonText: '确定',
        cancelButtonText: '跳过',
        inputPlaceholder: '物流单号'
      }).catch(() => ({ value: '' }))
      await api.updateOrderStatus({ orderId: row._id, status, shippingNo: value || '' })
    } else {
      await api.updateOrderStatus({ orderId: row._id, status })
    }
    ElMessage.success('状态已更新')
    loadList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '更新失败')
  }
}

async function onDelete(row) {
  if (!row?._id || !appStore.currentStoreId) return
  try {
    await ElMessageBox.confirm(
      `确定删除订单 ${row.orderNo || row._id}？\n\n将删除：\n· frame_orders 订单记录\n· 订单成片云存储文件（若无其它订单引用）\n· 关联 photos 的成片字段与 ai_tasks\n\n不退还门店 balance，原图仍保留在云相册。`,
      '删除订单',
      { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  deletingId.value = row._id
  try {
    const res = await api.deleteOrder({
      orderId: row._id,
      storeId: appStore.currentStoreId
    })
    const parts = [`订单已删除`]
    if (res.deletedPortraitFiles) parts.push(`${res.deletedPortraitFiles} 个成片文件`)
    if (res.clearedPhotos) parts.push(`${res.clearedPhotos} 条 photos 成片已清空`)
    if (res.deletedTasks) parts.push(`${res.deletedTasks} 条 ai_tasks`)
    ElMessage.success(parts.join('，'))
    await loadList()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  } finally {
    deletingId.value = ''
  }
}

watch(() => appStore.currentStoreId, () => {
  page.value = 1
  loadList()
})

onMounted(loadList)
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}

.table-actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}

.table-actions :deep(.el-dropdown) {
  vertical-align: middle;
}
</style>
