import type { RendererLifecycleScope } from './utils/rendererLifecycleScope'

declare module 'vue/types/vue' {
    interface Vue {
        lifecycleScope?: RendererLifecycleScope
    }
}
