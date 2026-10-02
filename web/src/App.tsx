import { lazy, type ReactNode, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Mascot } from "./brand";
import { useMe } from "./lib/session";
import { AppFrame } from "./studio/AppFrame";
import { SignInPage } from "./studio/SignInPage";

// The public runner and the studio are separate bundles: a visitor never downloads the editor.
const PublicRunner = lazy(() =>
  import("./runner/PublicRunner").then((m) => ({ default: m.PublicRunner })),
);
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
const OAuthSignInPage = lazy(() =>
  import("./oauth/OAuthPages").then((m) => ({ default: m.OAuthSignInPage })),
);
const ConsentPage = lazy(() =>
  import("./oauth/OAuthPages").then((m) => ({ default: m.ConsentPage })),
);
const BillingPage = lazy(() =>
  import("./studio/BillingPage").then((m) => ({ default: m.BillingPage })),
);

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Mascot kind="round" size={56} />
    </div>
  );
}

function Studio({ children, bare }: { children: ReactNode; bare?: boolean }) {
  const me = useMe();
  if (me.isLoading) {
    return <Splash />;
  }
  if (!me.data) {
    return <SignInPage />;
  }
  return bare ? children : <AppFrame me={me.data}>{children}</AppFrame>;
}

export function App() {
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/r/:token" element={<PublicRunner />} />
        <Route path="/sign-in" element={<OAuthSignInPage />} />
        <Route path="/consent" element={<ConsentPage />} />
        <Route path="/r/:token/:runId" element={<PublicRunner />} />
        <Route
          path="/"
          element={
            <Studio>
              <HomePage />
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
          path="/w/:id"
          element={
            <Studio bare>
              <EditorPage />
            </Studio>
          }
        />
        <Route
          path="/settings"
          element={
            <Studio>
              <SettingsPage />
            </Studio>
          }
        />
        <Route
          path="/billing"
          element={
            <Studio>
              <BillingPage />
            </Studio>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
