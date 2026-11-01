// Lets typescript-eslint type `.vue` imports in `.ts` files. vue-tsc uses the real SFC types.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}
