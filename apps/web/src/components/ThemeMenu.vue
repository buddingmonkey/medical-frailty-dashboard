<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue'

import ThemeIcon from './ThemeIcon.vue'

type Theme = 'system' | 'light' | 'dark'

// Same key and values as public/theme-init.js, which applies the choice before first paint.
const STORAGE_KEY = 'mfcd-theme'
const options: readonly Theme[] = ['system', 'light', 'dark']
const labels: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' }

function readStored(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

function apply(value: Theme) {
  const root = document.documentElement
  if (value === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', value)
}

function persist(value: Theme) {
  try {
    if (value === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Storage is blocked (private mode, site data off): the choice lasts for this page only.
  }
}

const theme = ref<Theme>(readStored())
const open = ref(false)
const activeIndex = ref(0)
const menuId = useId()
const rootEl = useTemplateRef<HTMLDivElement>('root')
const buttonEl = useTemplateRef<HTMLButtonElement>('button')
const itemEls = useTemplateRef<HTMLLIElement[]>('items')

async function openMenu(index = options.indexOf(theme.value)) {
  open.value = true
  activeIndex.value = index
  await nextTick()
  itemEls.value?.[index]?.focus()
}

function closeMenu(returnFocus = true) {
  open.value = false
  if (returnFocus) buttonEl.value?.focus()
}

function select(value: Theme) {
  theme.value = value
  apply(value)
  persist(value)
  closeMenu()
}

function moveTo(index: number) {
  const count = options.length
  activeIndex.value = (index + count) % count
  itemEls.value?.[activeIndex.value]?.focus()
}

function onButtonKeydown(event: KeyboardEvent) {
  // Enter and Space reach the click handler as a native button click.
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    void openMenu()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    void openMenu(options.length - 1)
  }
}

function onMenuKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      moveTo(activeIndex.value + 1)
      break
    case 'ArrowUp':
      moveTo(activeIndex.value - 1)
      break
    case 'Home':
      moveTo(0)
      break
    case 'End':
      moveTo(options.length - 1)
      break
    case 'Enter':
    case ' ': {
      const value = options[activeIndex.value]
      if (value) select(value)
      break
    }
    case 'Escape':
      closeMenu()
      break
    case 'Tab':
      closeMenu(false)
      return
    default:
      return
  }
  event.preventDefault()
}

function onDocumentPointerDown(event: PointerEvent) {
  if (open.value && !rootEl.value?.contains(event.target as Node | null)) closeMenu(false)
}

onMounted(() => {
  apply(theme.value)
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="button"
      type="button"
      :aria-label="`Theme: ${labels[theme]}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      class="flex items-center gap-1 rounded-md border border-on-header/40 px-2 py-1.5 text-on-header hover:bg-on-header/10 focus-visible:outline-highlight"
      @click="open ? closeMenu() : openMenu()"
      @keydown="onButtonKeydown"
    >
      <ThemeIcon :name="theme" />
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <ul
      v-if="open"
      :id="menuId"
      role="menu"
      aria-label="Theme"
      class="absolute right-0 z-20 mt-2 min-w-40 rounded-md border border-border bg-background py-1 text-foreground shadow-lg"
      @keydown="onMenuKeydown"
    >
      <li
        v-for="(option, index) in options"
        :key="option"
        ref="items"
        role="menuitemradio"
        :aria-checked="option === theme"
        tabindex="-1"
        class="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-surface focus:bg-surface focus-visible:-outline-offset-2"
        @click="select(option)"
        @focus="activeIndex = index"
      >
        <ThemeIcon :name="option" />
        <span class="flex-1">{{ labels[option] }}</span>
        <svg
          v-if="option === theme"
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </li>
    </ul>
  </div>
</template>
