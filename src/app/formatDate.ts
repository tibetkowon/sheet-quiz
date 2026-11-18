// 날짜는 화면 어디서나 ISO 8601 날짜(YYYY-MM-DD)로 보여준다. 기준은 사용자의 로컬 시간대다.
export function formatIsoDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
