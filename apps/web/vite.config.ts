import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vueRouter from 'vue-router/vite'

export default defineConfig({
  // The router plugin must come before the Vue plugin.
  plugins: [vueRouter({ dts: 'src/typed-router.d.ts' }), vue(), tailwindcss()],
})
