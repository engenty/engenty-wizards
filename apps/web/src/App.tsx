import { lazy, type ReactNode, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { Mascot } from "./brand";
import { useLang } from "./lib/i18n";
import { useMe } from "./lib/session";
import { AppFrame } from "./studio/AppFrame";
import { SignInPage } from "./studio/SignInPage";

// The public runner and the studio are separate bundles: a visitor never downloads the editor.
const PublicRunner = lazy(() =>
  import("./runner/PublicRunner").then((m) => ({ default: m.PublicRunner })),
);
const SharePage = lazy(() => import("./share/SharePage").then((m) => ({ default: m.SharePage })));
const EditorPage = lazy(() =>
  import("./studio/EditorPage").then((m) => ({ default: m.EditorPage })),
);
const HomePage = lazy(() => import("./studio/HomePage").then((m) => ({ default: m.HomePage })));
const NewWizardPage = lazy(() =>
  import("./studio/NewWizardPage").then((m) => ({ default: m.NewWizardPage })),
);
const SettingsPage = lazy(() =>
  import("./studio/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const GalleryPage = lazy(() =>
  import("./studio/GalleryPage").then((m) => ({ default: m.GalleryPage })),
);
const SetupPage = lazy(() => import("./studio/SetupPage").then((m) => ({ default: m.SetupPage })));

const EngentyBuilder = import.meta.env.DEV
  ? lazy(() => import("./dev/EngentyBuilder").then((m) => ({ default: m.EngentyBuilder })))
  : null;

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Mascot kind="round" size={56} />
    </div>
  );
}

function Studio({ children, bare }: { children: ReactNode; bare?: boolean }) {
  const me = useMe();
  const location = useLocation();
  if (me.isLoading) {
    return <Splash />;
  }
  if (!me.data) {
    return <SignInPage />;
  }
  // A runtime that runs alone is set up once, before anything else.
  if (me.data.mode === "local" && !me.data.setupDone && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }
  return bare ? children : <AppFrame me={me.data}>{children}</AppFrame>;
}

export function App() {
  // A switch of language renders the whole app again, in place.
  useLang();
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        {EngentyBuilder && <Route path="/dev/engenty-builder" element={<EngentyBuilder />} />}
        <Route path="/w/:token" element={<PublicRunner />} />
        <Route path="/w/:token/:runId" element={<PublicRunner />} />
        <Route path="/s/:token" element={<SharePage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route
          path="/"
          element={
            <Studio>
              <HomePage />
            </Studio>
          }
        />
        <Route
          path="/sign-in"
          element={
            <Studio>
              <Navigate to="/" replace />
            </Studio>
          }
        />
        <Route
          path="/new"
          element={
            <Studio>
              <NewWizardPage />
            </Studio>
          }
        />
        <Route
          path="/edit/:id"
          element={
            <Studio bare>
              <EditorPage />
            </Studio>
          }
        />
        <Route
          path="/settings/:section?"
          element={
            <Studio>
              <SettingsPage />
            </Studio>
          }
        />
        <Route
          path="/setup"
          element={
            <Studio bare>
              <SetupPage />
            </Studio>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
