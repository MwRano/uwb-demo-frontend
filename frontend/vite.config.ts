import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // /api から始まるリクエストをバックエンド(8000番)に転送する
      '/api': {
        // ▼ 修正: コンテナ名ではなく Mac本体(host) を経由させる魔法の言葉 ▼
        target: 'http://host.docker.internal:8000',
        changeOrigin: true,
      }
    }
  }
})