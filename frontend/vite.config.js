import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 本地开发时把 /api 代理到 netlify dev 的默认端口 8888
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:8888',
    },
  },
});
