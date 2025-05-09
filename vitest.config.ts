// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 다른 기존 설정들...

    // 모든 테스트를 단일 스레드에서 순차적으로 실행하도록 설정
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },

    // (선택적이지만 권장) 훅 타임아웃도 충분히 설정
    // hookTimeout: 30000, // 예: 30초
    // testTimeout: 30000, // 예: 30초
  },
});
