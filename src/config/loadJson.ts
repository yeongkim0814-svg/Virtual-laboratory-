/**
 * public/ 아래 JSON 을 배포 경로(base)에 맞춰 불러온다.
 * JS 번들과 달리 이 파일들은 이름에 해시가 없어서, 배포가 바뀌어도 브라우저나
 * GitHub Pages 캐시가 예전 버전을 계속 줄 수 있다(그러면 새 코드가 기대하는 필드가
 * 옛 JSON에는 없어 런타임 오류가 난다). 그래서 캐시를 쓰지 않고 항상 새로 받는다.
 */
export async function loadPublicJson<T>(fileName: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}${fileName}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${fileName} 로드 실패: ${res.status}`);
  return (await res.json()) as T;
}
