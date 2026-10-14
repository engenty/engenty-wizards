import { t } from "./i18n";

/**
 * Puts a text on the clipboard and says whether it arrived: only then may a button say "Copied".
 * Without the clipboard (a denied permission, an address that is not secure) the text is handed
 * over to copy by hand.
 */
export function copyText(text: string, fallback: string = t("copy.failed")): Promise<boolean> {
  return Promise.resolve()
    .then(() => navigator.clipboard.writeText(text))
    .then(
      () => true,
      () => {
        window.prompt(fallback, text);
        return false;
      },
    );
}
