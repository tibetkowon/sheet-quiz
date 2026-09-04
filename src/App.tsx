import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AppShell } from "./app/AppShell";
import StartPage from "./pages/StartPage";
import TopFolderSelectPage from "./pages/TopFolderSelectPage";
import DriveBrowsePage from "./pages/DriveBrowsePage";
import SheetTabSelectPage from "./pages/SheetTabSelectPage";
import SheetValidationPage from "./pages/SheetValidationPage";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

export default function App() {
  return (
    <AuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<StartPage />} />
            <Route path="/folders/select" element={<TopFolderSelectPage />} />
            <Route path="/folders" element={<DriveBrowsePage />} />
            <Route path="/folders/:folderId" element={<DriveBrowsePage />} />
            <Route path="/sheets/:spreadsheetId/tabs" element={<SheetTabSelectPage />} />
            <Route path="/sheets/:spreadsheetId/validate" element={<SheetValidationPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </AuthProvider>
  );
}
