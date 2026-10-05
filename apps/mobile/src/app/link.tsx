import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { findWizard } from "../data/db";
import { parseInput } from "../data/links";
import { APP_THEME } from "../theme/theme";
import { Screen } from "../ui/ui";

type Target = Parameters<typeof Redirect>[0]["href"];

/**
 * A link the app was opened with. A wizard on this phone starts (or opens the run in the link);
 * a new one is shown first, to be added; a shared result opens read-only.
 */
export default function LinkScreen() {
  const { url } = useLocalSearchParams<{ url: string }>();
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    const parsed = parseInput(url ?? "");
    if (!parsed) {
      setTarget("/");
      return;
    }
    if (parsed.kind === "result") {
      setTarget({ pathname: "/shared", params: { url } });
      return;
    }
    if (parsed.kind !== "wizard") {
      setTarget({ pathname: "/add", params: { input: url } });
      return;
    }
    // The wizard's own link, also when the app was opened with engenty-wizards://w?url=…
    const link = `${parsed.runtime}/w/${parsed.token}${parsed.runId ? `/${parsed.runId}` : ""}`;
    void findWizard(parsed.runtime, parsed.token).then((saved) => {
      if (!saved) {
        setTarget({ pathname: "/add", params: { input: link } });
      } else if (parsed.runId) {
        setTarget({ pathname: "/run", params: { wizard: String(saved.id), runId: parsed.runId } });
      } else {
        setTarget({ pathname: "/wizard/[id]", params: { id: String(saved.id) } });
      }
    });
  }, [url]);

  if (target) {
    return <Redirect href={target} />;
  }
  return (
    <Screen theme={APP_THEME} style={{ alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={APP_THEME.ink3} />
    </Screen>
  );
}
