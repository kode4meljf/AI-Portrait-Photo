import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORE_KEY = 'admin_current_store'

export const useAppStore = defineStore('app', () => {
  const currentStoreId = ref(localStorage.getItem(STORE_KEY) || '')
  const currentStoreName = ref('')

  function setStore(store) {
    if (!store) {
      currentStoreId.value = ''
      currentStoreName.value = ''
      localStorage.removeItem(STORE_KEY)
      return
    }
    currentStoreId.value = store._id
    currentStoreName.value = store.name || store._id
    localStorage.setItem(STORE_KEY, store._id)
  }

  return { currentStoreId, currentStoreName, setStore }
})
