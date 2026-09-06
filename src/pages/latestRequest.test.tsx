import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authContext from "../auth/AuthContext";
import * as drive from "../drive/driveClient";
import { DriveApiError } from "../drive/driveApiError";
import * as sheets from "../sheets/sheetsClient";
import * as topFolders from "../storage/topFolderRepo";
import * as attempts from "../storage/attemptRepo";
import type { StudyAttempt } from "../types/studyAttempt";
import DriveBrowsePage from "./DriveBrowsePage";
import HistoryPage from "./HistoryPage";
import SheetTabSelectPage from "./SheetTabSelectPage";
import SheetValidationPage from "./SheetValidationPage";
import TopFolderSelectPage from "./TopFolderSelectPage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const tabState = { tabId: 0, tabTitle: "문제은행" };
function SwitchRoute({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to, { state: tabState })}>경로 변경</button>;
}

function renderPage(page: ReactElement, route: string, from: string, to: string) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: from, state: tabState }]}>
      <SwitchRoute to={to} />
      <Routes>
        <Route path={route} element={page} />
        <Route path="/sheets/:spreadsheetId/validate" element={<div>잘못된 자동 이동</div>} />
        <Route path="/quiz/:attemptId/*" element={<div>잘못된 풀이 이동</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const folder = (id: string): drive.DriveFolder => ({ id, name: id, modifiedTime: "" });
const rows = [
  ["번호", "분류", "난이도", "유형", "문제", "보기 A", "보기 B", "보기 C", "보기 D", "정답", "해설"],
  ["1", "분류", "MEDIUM", "SINGLE", "문제 1", "A", "B", "", "", "A", "해설"],
];

describe("페이지의 최신 요청 보호", () => {
  let auth: ReturnType<typeof authContext.useAuth>;
  beforeEach(() => {
    auth = {
      status: "connected", googleUserId: "user-1", email: "user@example.com", error: null,
      connect: vi.fn().mockResolvedValue(true), disconnect: vi.fn(), markExpired: vi.fn(),
      getAccessToken: () => "token",
    };
    vi.spyOn(authContext, "useAuth").mockImplementation(() => auth);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["success", "error"])("Drive 이전 폴더의 늦은 %s는 현재 폴더를 바꾸지 않습니다", async (outcome) => {
    const old = deferred<drive.DriveFolder[]>();
    vi.spyOn(topFolders, "getTopFolder").mockResolvedValue({
      googleUserId: "user-1", folderId: "top", folderName: "Top", updatedAt: "",
    });
    vi.spyOn(drive, "listChildFolders").mockImplementation((_token, id) =>
      id === "old" ? old.promise : Promise.resolve([folder("최신 폴더")]));
    vi.spyOn(drive, "listSheetFiles").mockResolvedValue([]);
    renderPage(<DriveBrowsePage />, "/folders/:folderId", "/folders/old", "/folders/new");
    await waitFor(() => expect(drive.listChildFolders).toHaveBeenCalledWith("token", "old"));
    fireEvent.click(screen.getByText("경로 변경"));
    await screen.findByText(/최신 폴더/);
    await act(async () => {
      if (outcome === "success") old.resolve([folder("오래된 폴더")]);
      else old.reject(new DriveApiError(401, "오래된 오류"));
    });
    expect(screen.getByText(/최신 폴더/)).toBeInTheDocument();
    expect(screen.queryByText(/오래된/)).not.toBeInTheDocument();
    expect(auth.markExpired).not.toHaveBeenCalled();
  });

  it("최상위 폴더 새로고침의 이전 응답은 최신 목록을 덮어쓰지 않습니다", async () => {
    const old = deferred<drive.DriveFolder[]>();
    vi.spyOn(drive, "listRootFolders").mockReturnValueOnce(old.promise)
      .mockResolvedValue([folder("최신 목록")]);
    render(<MemoryRouter><TopFolderSelectPage /></MemoryRouter>);
    fireEvent.click(screen.getByText("새로고침"));
    await screen.findByText("최신 목록");
    await act(async () => { old.resolve([folder("오래된 목록")]); });
    expect(screen.getByText("최신 목록")).toBeInTheDocument();
    expect(screen.queryByText("오래된 목록")).not.toBeInTheDocument();
  });

  it("사용자가 변경되면 이전 IndexedDB 기록 조회 결과를 무시합니다", async () => {
    const old = deferred<StudyAttempt[]>();
    vi.spyOn(attempts, "listAttemptsByUser").mockReturnValueOnce(old.promise).mockResolvedValue([]);
    const view = render(<MemoryRouter><HistoryPage /></MemoryRouter>);
    auth = { ...auth, googleUserId: "user-2" };
    view.rerender(<MemoryRouter><HistoryPage /></MemoryRouter>);
    await screen.findByText("아직 저장된 풀이 기록이 없습니다.");
    await act(async () => {
      old.resolve([{
        id: "old", googleUserId: "user-1", spreadsheetId: "s", spreadsheetName: "",
        sheetTabId: "0", sheetTabName: "이전 기록", parentFolderId: "",
        certificationFolderName: "", questionSetFingerprint: "", sourceModifiedTime: "",
        lastViewedIndex: 0, startedAt: "", updatedAt: "", progress: [],
      }]);
    });
    expect(screen.getByText("아직 저장된 풀이 기록이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText(/이전 기록/)).not.toBeInTheDocument();
  });

  it("이전 시트의 우선 탭 응답은 다른 시트에서 자동 이동하지 않습니다", async () => {
    const old = deferred<sheets.SheetTab[]>();
    vi.spyOn(sheets, "listSheetTabs").mockReturnValueOnce(old.promise)
      .mockResolvedValue([{ sheetId: 1, title: "최신 탭" }, { sheetId: 2, title: "다른 탭" }]);
    renderPage(<SheetTabSelectPage />, "/sheets/:spreadsheetId/tabs", "/sheets/old/tabs", "/sheets/new/tabs");
    fireEvent.click(screen.getByText("경로 변경"));
    await screen.findByText("최신 탭");
    await act(async () => { old.resolve([{ sheetId: 0, title: "문제은행" }]); });
    expect(screen.getByText("최신 탭")).toBeInTheDocument();
    expect(screen.queryByText("잘못된 자동 이동")).not.toBeInTheDocument();
  });

  it("이전 시트의 검증 응답은 현재 검증 결과를 덮어쓰지 않습니다", async () => {
    const old = deferred<string[][]>();
    vi.spyOn(sheets, "getSheetValues").mockReturnValueOnce(old.promise).mockResolvedValue(rows);
    renderPage(<SheetValidationPage />, "/sheets/:spreadsheetId/validate", "/sheets/old/validate", "/sheets/new/validate");
    fireEvent.click(screen.getByText("경로 변경"));
    await screen.findByText(/문제 1개/);
    await act(async () => { old.resolve([rows[0]]); });
    expect(screen.getByText(/문제 1개/)).toBeInTheDocument();
    expect(screen.queryByText(/풀 수 있는 문제가 없습니다/)).not.toBeInTheDocument();
  });

  it("풀이 시작의 기록 조회 중 경로가 바뀌면 이전 풀이로 이동하거나 저장하지 않습니다", async () => {
    const old = deferred<StudyAttempt | undefined>();
    vi.spyOn(sheets, "getSheetValues").mockResolvedValue(rows);
    vi.spyOn(attempts, "getAttempt").mockReturnValue(old.promise);
    const save = vi.spyOn(attempts, "saveAttempt").mockResolvedValue();
    renderPage(<SheetValidationPage />, "/sheets/:spreadsheetId/validate", "/sheets/old/validate", "/sheets/new/validate");
    fireEvent.click(await screen.findByRole("button", { name: "풀이 시작" }));
    fireEvent.click(screen.getByText("경로 변경"));
    await screen.findByRole("button", { name: "풀이 시작" });
    await act(async () => { old.resolve(undefined); });
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByText("잘못된 풀이 이동")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "풀이 시작" })).toBeEnabled();
  });
});
