import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api/admin'

const TOKEN_KEY = 'admin_token'
const USER_KEY = 'admin_user'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const user = ref(JSON.parse(localStorage.getItem(USER_KEY) || 'null'))

  const isLoggedIn = computed(() => Boolean(token.value))

  async function login(username, password) {
    const result = await api.login(username, password)
    token.value = result.token
    user.value = result.user
    localStorage.setItem(TOKEN_KEY, result.token)
    localStorage.setItem(USER_KEY, JSON.stringify(result.user))
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  return { token, user, isLoggedIn, login, logout }
})
