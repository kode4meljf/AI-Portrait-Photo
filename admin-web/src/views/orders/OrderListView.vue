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

    <div class="page-toolbar">
      <el-button
        type="primary"
        :disabled="!appStore.currentStoreId"
        :loading="loading"
        @click="loadList"
      >
        刷新
      </el-button>
    </div>

    <div v-if="selectedRows.length" class="toolbar">
      <span class="toolbar-tip">已选 {{ selectedRows.length }} 条</span>
      <el-button type="primary" :loading="exporting" @click="onBatchExport">导出</el-button>
      <el-button type="danger" :loading="batchDeleting" @click="onBatchDelete">批量删除</el-button>
    </div>

    <el-table
      ref="tableRef"
      :data="list"
      v-loading="loading"
      stripe
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="48" />
      <el-table-column prop="orderNo" label="订单号" min-width="150" />
      <el-table-column prop="orderTypeLabel" label="类型" width="72" />
      <el-table-column prop="customerName" label="客户" width="100" />
      <el-table-column label="产品" min-width="120">
        <template #default="{ row }">
          <span v-if="row.orderType === 'album'">{{ row.productName }}（{{ row.photoCount }}张）</span>
          <span v-else>{{ row.frameName }}</span>
        </template>
      </el-table-column>
      <el-table-column label="规格" min-width="140">
        <template #default="{ row }">
          <span v-if="row.orderType === 'album'">-</span>
          <span v-else>{{ row.size }} · {{ row.material }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="物流单号" min-width="130">
        <template #default="{ row }">
          <span>{{ row.shippingNo || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="导出" width="88">
        <template #default="{ row }">
          <el-tag v-if="row.exportedAtText" type="success" size="small">已导出</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="createTimeText" label="创建时间" min-width="160" />
      <el-table-column label="操作" width="220" fixed="right">
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
              v-if="canFillShipping(row)"
              link
              type="primary"
              @click="onFillShipping(row)"
            >
              物流单号
            </el-button>
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
import { buildOrdersExportZip, EXPORTABLE_STATUSES } from '@/utils/orderExport'

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
const batchDeleting = ref(false)
const exporting = ref(false)
const selectedRows = ref([])
const tableRef = ref(null)

function statusTagType(status) {
  const map = {
    待处理: 'info',
    制作中: 'warning',
    已发货: '',
    已完成: 'success'
  }
  return map[status] || 'info'
}

function canFillShipping(row) {
  return ['已发货', '制作中'].includes(row.status)
}

function onSelectionChange(rows) {
  selectedRows.value = rows || []
}

function clearSelection() {
  selectedRows.value = []
  tableRef.value?.clearSelection()
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
    clearSelection()
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

function orderPayload(row) {
  return {
    orderId: row._id,
    orderType: row.orderType || 'frame',
    storeId: appStore.currentStoreId
  }
}

async function changeStatus(row, status) {
  try {
    let shippingNo
    if (status === '已发货') {
      const { value } = await ElMessageBox.prompt(
        '请输入物流单号（可选，系统将自动识别快递公司）',
        '发货',
        {
          confirmButtonText: '确定',
          cancelButtonText: '跳过',
          inputPlaceholder: '物流单号',
          inputValue: row.shippingNo || ''
        }
      ).catch(() => ({ value: '' }))
      shippingNo = value || ''
      await api.updateOrderStatus({
        ...orderPayload(row),
        status,
        shippingNo
      })
    } else {
      await api.updateOrderStatus({
        ...orderPayload(row),
        status
      })
    }
    ElMessage.success('状态已更新')
    loadList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '更新失败')
  }
}

async function onFillShipping(row) {
  try {
    const { value } = await ElMessageBox.prompt('请输入物流单号', '回填物流单号', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputPlaceholder: '物流单号',
      inputValue: row.shippingNo || ''
    })
    await api.updateOrderShipping({
      ...orderPayload(row),
      shippingNo: value || ''
    })
    ElMessage.success('物流单号已保存')
    loadList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '保存失败')
  }
}

async function onDelete(row) {
  if (!row?._id || !appStore.currentStoreId) return
  const typeLabel = row.orderType === 'album' ? '影集' : '摆台'
  try {
    await ElMessageBox.confirm(
      `确定删除${typeLabel}订单 ${row.orderNo || row._id}？`,
      '删除订单',
      { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  deletingId.value = row._id
  try {
    const res = await api.deleteOrder(orderPayload(row))
    const parts = ['订单已删除']
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

async function onBatchDelete() {
  if (!selectedRows.value.length || !appStore.currentStoreId) return
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${selectedRows.value.length} 条订单？`,
      '批量删除',
      { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  batchDeleting.value = true
  try {
    const res = await api.batchDeleteOrders({
      storeId: appStore.currentStoreId,
      items: selectedRows.value.map((row) => ({
        orderId: row._id,
        orderType: row.orderType || 'frame'
      }))
    })
    const failed = res.failed || []
    if (failed.length) {
      ElMessage.warning(`已删除 ${res.deletedCount} 条，${failed.length} 条失败`)
    } else {
      ElMessage.success(`已删除 ${res.deletedCount} 条订单`)
    }
    await loadList()
  } catch (e) {
    ElMessage.error(e.message || '批量删除失败')
  } finally {
    batchDeleting.value = false
  }
}

async function onBatchExport() {
  if (!selectedRows.value.length || !appStore.currentStoreId) return

  const exportable = selectedRows.value.filter((row) => EXPORTABLE_STATUSES.includes(row.status))
  const skippedCount = selectedRows.value.length - exportable.length
  if (!exportable.length) {
    ElMessage.warning('所选订单均不可导出（仅支持待处理、制作中）')
    return
  }

  let confirmMsg = `将导出 ${exportable.length} 条订单，打包为一个 zip 文件。`
  if (skippedCount) {
    confirmMsg += `\n另有 ${skippedCount} 条因状态不符将跳过。`
  }
  confirmMsg += '\n导出后：待处理订单将变为制作中，并标记已导出。'

  try {
    await ElMessageBox.confirm(confirmMsg, '导出订单', {
      confirmButtonText: '开始导出',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }

  exporting.value = true
  try {
    const data = await api.exportOrders({
      storeId: appStore.currentStoreId,
      items: exportable.map((row) => ({
        orderId: row._id,
        orderType: row.orderType || 'frame'
      }))
    })
    await buildOrdersExportZip(data)
    const parts = [`已导出 ${data.exportedCount} 条`]
    if ((data.skipped || []).length) parts.push(`${data.skipped.length} 条已跳过`)
    ElMessage.success(parts.join('，'))
    await loadList()
  } catch (e) {
    ElMessage.error(e.message || '导出失败')
  } finally {
    exporting.value = false
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
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.toolbar-tip {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}

.table-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.table-actions :deep(.el-dropdown) {
  vertical-align: middle;
}
</style>
