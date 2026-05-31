import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/LoginView.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/dashboard/DashboardView.vue'),
        meta: { title: '数据看板' }
      },
      {
        path: 'stores',
        name: 'stores',
        component: () => import('@/views/stores/StoreListView.vue'),
        meta: { title: '门店管理' }
      },
      {
        path: 'stores/:id',
        name: 'store-detail',
        component: () => import('@/views/stores/StoreDetailView.vue'),
        meta: { title: '门店详情' }
      },
      {
        path: 'customers',
        name: 'customers',
        component: () => import('@/views/customers/CustomerListView.vue'),
        meta: { title: '客户管理' }
      },
      {
        path: 'orders',
        name: 'orders',
        component: () => import('@/views/orders/OrderListView.vue'),
        meta: { title: '订单管理' }
      },
      {
        path: 'checkins',
        name: 'checkins',
        component: () => import('@/views/checkins/CheckinView.vue'),
        meta: { title: '打卡管理' }
      },
      {
        path: 'gallery',
        name: 'gallery',
        component: () => import('@/views/gallery/GalleryListView.vue'),
        meta: { title: '云相册' }
      },
      {
        path: 'styles',
        name: 'styles',
        component: () => import('@/views/styles/StyleListView.vue'),
        meta: { title: '风格管理' }
      },
      {
        path: 'frames',
        name: 'frames',
        component: () => import('@/views/frames/FrameListView.vue'),
        meta: { title: '相框管理' }
      },
      {
        path: 'packages',
        name: 'packages',
        component: () => import('@/views/packages/PackageListView.vue'),
        meta: { title: '套餐管理' }
      },
      {
        path: 'settings/platform',
        name: 'platform-settings',
        component: () => import('@/views/settings/PlatformSettingsView.vue'),
        meta: { title: '平台配置' }
      },
      {
        path: 'feedbacks',
        name: 'feedbacks',
        component: () => import('@/views/feedbacks/FeedbackListView.vue'),
        meta: { title: '意见反馈' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.isLoggedIn) {
    return { name: 'dashboard' }
  }
  return true
})

export default router
