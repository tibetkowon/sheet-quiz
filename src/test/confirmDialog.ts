import { fireEvent, screen, within } from "@testing-library/react";

// jsdom에는 <dialog>의 모달 API가 없어 열림 속성만 흉내 낸다.
export function stubDialogApi(): void {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
}

// 열려 있는 확인 대화상자에서 지정한 이름의 버튼(예: "삭제")을 누른다.
export async function confirmInDialog(actionName: string): Promise<void> {
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: actionName }));
}
