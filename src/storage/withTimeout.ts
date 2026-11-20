// 읽기·네트워크 호출 공통 제한 시간. Firestore는 오프라인이면 약 10초 뒤 캐시로 돌아오므로 그보다 길게 잡는다.
export const READ_TIMEOUT_MS = 15_000;

// iOS가 백그라운드에서 연결을 끊으면 promise가 영영 끝나지 않을 수 있어, 화면이 "불러오는 중"에 멈추지 않게 한다.
export function withTimeout<T>(promise: Promise<T>, ms: number = READ_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("응답이 없습니다. 잠시 후 다시 시도해주세요.")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// fetch용 제한 시간 signal. AbortSignal.timeout은 Safari 16부터라 iOS 15 이하에서도 동작하게 직접 만든다.
export function timeoutSignal(ms: number = READ_TIMEOUT_MS): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
