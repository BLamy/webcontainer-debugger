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

type WebContainerStatus = "booting" | "installing" | "mounting" | "ready" | "none" | "error";
interface WebContainerContextValue {
  webContainer: WebContainer | null;
  status: WebContainerStatus;
}

export const WebContainerContext = createContext<WebContainerContextValue>(
  {} as WebContainerContextValue
);

export const WebContainerProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [webContainer, setWebContainer] = useState<WebContainer | null>(null);
  const [status, setStatus] = useState<WebContainerStatus>("none");

  useEffect(() => {
    const bootWebContainer = async () => {
      try {
        setStatus("booting");
        const wcInstance = await WebContainer.boot();
        if (import.meta.env.DEV) {
          // @ts-expect-error debugging handle, not part of Window typings
          window.webcontainerInstance = wcInstance;
        }
        setStatus("mounting");
        await wcInstance.mount(files);
        setStatus("installing");
        const installProcess = await wcInstance.spawn("pnpm", ["install"]); // Use pnpm
        const installExitCode = await installProcess.exit;

        if (installExitCode !== 0) {
          setStatus("error");
          console.error("Failed to install dependencies.");
          return;
        }

        setWebContainer(wcInstance);
        setStatus("ready");
      } catch (error) {
        setStatus("error");
        console.error("Error booting WebContainer:", error);
      }
    };

    bootWebContainer();
  }, []);

  return (
    <WebContainerContext.Provider value={{ webContainer, status }}>
      {children}
    </WebContainerContext.Provider>
  );
};

export const useWebContainer = () => useContext(WebContainerContext); 