import '@fontsource-variable/jost'
import '@fontsource-variable/source-sans-3'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './styles/main.css'

import { VueQueryPlugin } from '@tanstack/vue-query'
import { createApp } from 'vue'

import App from './App.vue'
import { queryClient } from './lib/query-client'
import { router } from './router'

createApp(App).use(router).use(VueQueryPlugin, { queryClient }).mount('#app')
