import { type BarcodeType, CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { type ReactNode, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import { APP_THEME, FONT } from "../theme/theme";
import { Button, ICON, Icon, IconButton } from "./ui";

/** Every common barcode: a wizard's scan field takes article numbers and parcel codes too. */
const ALL_CODES: BarcodeType[] = [
  "qr",
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code39",
  "code93",
  "code128",
  "itf14",
  "codabar",
  "datamatrix",
  "pdf417",
  "aztec",
];

/**
 * The camera, full screen, with a frame for the code. `onCode` gets the first code it reads;
 * answering false keeps scanning (a code that is not what the screen wants).
 */
export function Scanner({
  title,
  hint,
  qrOnly,
  onCode,
  onClose,
  top,
}: {
  title: string;
  hint: string;
  qrOnly?: boolean;
  onCode: (text: string) => boolean | Promise<boolean>;
  onClose: () => void;
  /** Replaces the title in the top bar (the Scan | Enter ID switch). */
  top?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const handling = useRef(false);
  const ink = "#ffffff";

  const read = async (data: string) => {
    if (handling.current) {
      return;
    }
    handling.current = true;
    const ok = await onCode(data);
    if (ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setMessage(t("scan.notWizard"));
      setTimeout(() => {
        handling.current = false;
      }, 1500);
    }
  };

  return (
    <View style={styles.root}>
      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: qrOnly ? ["qr"] : ALL_CODES }}
          onBarcodeScanned={(r) => void read(r.data)}
        />
      ) : null}
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <IconButton label={t("scan.close")} onPress={onClose} background="rgba(0,0,0,0.35)">
          <Icon d={ICON.close} color={ink} />
        </IconButton>
        <View style={{ flex: 1, alignItems: "center" }}>
          {top ?? <Text style={styles.title}>{title}</Text>}
        </View>
        <IconButton
          label={t("scan.light")}
          onPress={() => setTorch((v) => !v)}
          background={torch ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.35)"}
        >
          <Icon d={ICON.flash} color={torch ? "#000" : ink} size={20} />
        </IconButton>
      </View>
      {permission?.granted ? (
        <View pointerEvents="none" style={styles.frameWrap}>
          <View style={[styles.frame, { borderColor: APP_THEME.ember }]} />
        </View>
      ) : (
        <View style={styles.ask}>
          <Text style={styles.hint}>{t("scan.permission")}</Text>
          {permission && !permission.canAskAgain ? null : (
            <Button
              theme={APP_THEME}
              label={t("scan.allow")}
              onPress={() => void requestPermission()}
            />
          )}
        </View>
      )}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.hint}>{message ?? hint}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#05070d" },
  top: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 2,
  },
  title: { color: "#fff", fontFamily: FONT.display, fontSize: 18 },
  frameWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  frame: { width: "68%", aspectRatio: 1, borderWidth: 3, borderRadius: 28 },
  ask: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    padding: 32,
  },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 32 },
  hint: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: FONT.ui,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
});
