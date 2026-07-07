import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  type FC,
  type ReactNode,
} from "react";
import { WebContainer } from "@webcontainer/api";
// @ts-ignore
import { files } from "virtual:webcontainer-files";

type WebContainerStatus =
  | "booting"
  | "installing"
  | "mounting"
  | "ready"
  | "none"
  | "error";
interface WebContainerContextValue {
  webContainer: WebContainer | null;
  status: WebContainerStatus;
}

export const WebContainerContext = createContext<WebContainerContextValue>({
  webContainer: null,
  status: "none",
});

// Only a single WebContainer may ever be booted per page. React StrictMode
// mounts effects twice in development, so the boot must be memoized at
// module level or the second mount rejects and the app shows an error.
let bootPromise: Promise<WebContainer> | null = null;
const bootOnce = () => {
  if (!bootPromise) {
    bootPromise = WebContainer.boot().catch((err) => {
      bootPromise = null; // allow a retry on genuine boot failure
      throw err;
    });
  }
  return bootPromise;
};

export const WebContainerProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [webContainer, setWebContainer] = useState<WebContainer | null>(null);
  const [status, setStatus] = useState<WebContainerStatus>("none");

  useEffect(() => {
    let cancelled = false;
    const safeSetStatus = (s: WebContainerStatus) => {
      if (!cancelled) setStatus(s);
    };

    const bootWebContainer = async () => {
      try {
        safeSetStatus("booting");
        const wcInstance = await bootOnce();
        // The StrictMode throwaway mount stops here so mount/install only
        // run once, driven by the surviving effect instance.
        if (cancelled) return;
        if (import.meta.env.DEV) {
          // @ts-expect-error debugging handle, not part of Window typings
          window.webcontainerInstance = wcInstance;
        }
        safeSetStatus("mounting");
        await wcInstance.mount(files);
        if (cancelled) return;
        safeSetStatus("installing");
        const installProcess = await wcInstance.spawn("pnpm", ["install"]);
        const installExitCode = await installProcess.exit;

        if (installExitCode !== 0) {
          safeSetStatus("error");
          console.error("Failed to install dependencies.");
          return;
        }

        if (!cancelled) {
          setWebContainer(wcInstance);
          setStatus("ready");
        }
      } catch (error) {
        safeSetStatus("error");
        console.error("Error booting WebContainer:", error);
      }
    };

    bootWebContainer();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WebContainerContext.Provider value={{ webContainer, status }}>
      {children}
    </WebContainerContext.Provider>
  );
};

export const useWebContainer = () => useContext(WebContainerContext);
