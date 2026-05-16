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
