/** public/ 아래 JSON 을 배포 경로(base)에 맞춰 불러온다. */
export async function loadPublicJson<T>(fileName: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}${fileName}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${fileName} 로드 실패: ${res.status}`);
  return (await res.json()) as T;
}
