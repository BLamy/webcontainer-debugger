// WebContainerDebugger.tsx – fully declarative React component
// (no direct DOM manipulation)

"use client";

import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  type FC,
} from "react";
import { WebContainerContext } from "./WebContainerProvider";

import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import "../index.css";
// @ts-ignore – vite virtual files
import { files } from "virtual:webcontainer-files";
import {
  collectDebugData,
  countTests,
  type DebugStep,
  type TestSuiteData,
} from "./collectDebugData";

/* ------------------------------------------------------------------ */
/* CodeMirror highlight plumbing                                       */
/* ------------------------------------------------------------------ */
const clearHighlight = StateEffect.define();
const addHighlight = StateEffect.define<DecorationSet>();
const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearHighlight)) return Decoration.none;
      if (e.is(addHighlight)) return e.value;
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/* ------------------------------------------------------------------ */
/* Helper formatters                                                   */
/* ------------------------------------------------------------------ */
export const formatVal = (v: unknown) => {
  if (v === undefined) return <span className="undefined">undefined</span>;
  if (v === null) return <span className="null">null</span>;
  if (typeof v === "boolean")
    return <span className="boolean">{String(v)}</span>;
  if (typeof v === "number") return <span className="number">{v}</span>;
  if (typeof v === "string") return <span className="string">"{v}"</span>;
  try {
    return <span className="object">{JSON.stringify(v)}</span>;
  } catch {
    return <span className="object">[Unserializable]</span>;
  }
};

/* ------------------------------------------------------------------ */
/* File tree helpers                                                   */
/* ------------------------------------------------------------------ */
export const getFileContents = (tree: any, filePath: string): string => {
  const parts = filePath.split("/").filter(Boolean);
  let current: any = tree;
  for (const part of parts) {
    const node = current?.[part];
    if (!node) return "";
    if (node.file) return typeof node.file.contents === "string" ? node.file.contents : "";
    current = node.directory;
  }
  return "";
};

const setFileContents = (tree: any, filePath: string, code: string): boolean => {
  const parts = filePath.split("/").filter(Boolean);
  let current: any = tree;
  for (const part of parts) {
    const node = current?.[part];
    if (!node) return false;
    if (node.file) {
      node.file.contents = code;
      return true;
    }
    current = node.directory;
  }
  return false;
};

/** Map an absolute path recorded by Babel to one of the editor's files. */
export const resolveEditorFile = (
  stepFile: string,
  available: string[]
): string | null => {
  if (!stepFile) return null;
  const normalized = stepFile.replace(/\\/g, "/");
  // longest suffix match against the known editor files
  const match = available
    .filter((f) => normalized === f || normalized.endsWith("/" + f))
    .sort((a, b) => b.length - a.length)[0];
  if (match) return match;
  return null;
};

/* ------------------------------------------------------------------ */
/* CodeEditor component                                                */
/* ------------------------------------------------------------------ */
const CodeEditor: FC<{
  currentFile: string;
  onChange: (code: string) => void;
  onReady: (view: EditorView | null) => void;
}> = ({ currentFile, onChange, onReady }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const initial = getFileContents(files, currentFile);
    const state = EditorState.create({
      doc: initial,
      extensions: [
        basicSetup,
        javascript(),
        oneDark,
        highlightField,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    onReady(view);

    return () => {
      onReady(null);
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFile]);

  return <div ref={hostRef} className="h-full w-full" data-testid="code-editor" />;
};

/* ------------------------------------------------------------------ */
/* DebuggerPanel                                                       */
/* ------------------------------------------------------------------ */
export const DebuggerPanel: FC<{
  steps: DebugStep[];
  onStepSelect: (s: DebugStep) => void;
}> = ({ steps, onStepSelect }) => {
  const [idx, setIdx] = useState(0);

  // A new set of steps (different test selected) must restart at step 0 —
  // otherwise the index from the previous test leaks out of range.
  useEffect(() => {
    setIdx(0);
  }, [steps]);

  const safeIdx = Math.min(idx, Math.max(0, steps.length - 1));

  useEffect(() => {
    if (steps.length && steps[safeIdx]) onStepSelect(steps[safeIdx]);
  }, [safeIdx, steps, onStepSelect]);

  return (
    <div className="wallaby-debugger flex flex-col h-full w-full overflow-hidden bg-[#252526] text-[#e0e0e0] text-[13px]">
      {/* controls */}
      <div className="debugger-controls flex items-center gap-2 px-3 py-2 bg-[#2d2d2d] border-b border-[#333] text-sm">
        <button aria-label="First step" onClick={() => setIdx(0)}>⏮️</button>
        <button
          aria-label="Previous step"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
        >
          ◀️
        </button>
        <div className="flex-1 text-center text-xs">
          {steps.length ? `Step ${safeIdx + 1}/${steps.length}` : "No steps"}
        </div>
        <button
          aria-label="Next step"
          onClick={() => setIdx((i) => Math.min(Math.max(0, steps.length - 1), i + 1))}
        >
          ▶️
        </button>
        <button
          aria-label="Last step"
          onClick={() => setIdx(Math.max(0, steps.length - 1))}
        >
          ⏭️
        </button>
      </div>

      {/* timeline */}
      <div className="timeline h-[30px] flex items-center px-3 bg-[#2a2a2a]">
        <div className="timeline-track w-full h-1 bg-[#3c3c3c] flex">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`timeline-point ${i === safeIdx ? "active" : ""}`}
              onClick={() => setIdx(i)}
            />
          ))}
        </div>
      </div>

      {/* vars */}
      <div className="variables-panel flex-1 overflow-y-auto pb-3">
        {steps[safeIdx]?.vars && Object.keys(steps[safeIdx].vars!).length ? (
          Object.entries(steps[safeIdx].vars!).map(([k, v]) => {
            const changed =
              safeIdx > 0 &&
              JSON.stringify(steps[safeIdx - 1]?.vars?.[k]) !==
                JSON.stringify(v);
            return (
              <div
                key={k}
                className={`variable px-3 py-1 flex justify-between ${
                  changed ? "changed" : ""
                }`}
              >
                <span className="var-name">{k}</span>
                {formatVal(v)}
              </div>
            );
          })
        ) : (
          <div className="no-data-message px-4 py-2 text-[#888]">
            No vars for this step
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* TestList                                                            */
/* ------------------------------------------------------------------ */
export const TestList: FC<{
  suites: TestSuiteData;
  onSelect: (steps: DebugStep[]) => void;
}> = ({ suites = {}, onSelect }) => {
  const suiteEntries = Object.entries(suites);
  return (
    <div className="test-list-container h-full overflow-y-auto text-[13px]">
      {suiteEntries.length === 0 && (
        <div className="no-data-message p-4 text-[#888] text-center">
          No tests with debug data.
        </div>
      )}
      {suiteEntries.map(([suiteName, tests]) => (
        <div key={suiteName}>
          <div className="suite-name px-3 py-1 text-xs uppercase tracking-wide text-[#7c7c7c] bg-[#2a2a2a]">
            {suiteName.split("/").join(" › ")}
          </div>
          <ul>
            {Object.entries(tests).map(([name, steps]) => (
              <li
                key={name}
                className="debug-test-item flex justify-between px-4 py-1 hover:bg-[#2a2d2e] cursor-pointer"
                onClick={() => onSelect(steps)}
              >
                <span className="test-name flex-1">{name}</span>
                <span className="test-steps text-xs text-[#888]">
                  {steps.length} steps
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */
const WebContainerDebugger: FC = () => {
  const { webContainer, status: webContainerStatus } =
    useContext(WebContainerContext);

  // UI state
  const [currentFile, setCurrentFile] = useState("utils.js");
  const [showDebugger, setShowDebugger] = useState(true);
  const [suites, setSuites] = useState<TestSuiteData>({});
  const [debugSteps, setDebugSteps] = useState<DebugStep[] | null>(null);
  const [status, setStatus] = useState({ text: "Ready", color: "#3BB446" });
  const [stats, setStats] = useState({ total: 0, passing: 0, time: "--" });

  // CodeMirror view ref
  const viewRef = useRef<EditorView | null>(null);
  // highlight retry when switching files (editor remounts async)
  const pendingHighlight = useRef<number | null>(null);

  // available JS files
  const filesAvailable = ["utils.js", "utils.test.js"];

  useEffect(() => {
    switch (webContainerStatus) {
      case "booting":
        setStatus({ text: "Booting Webcontainer...", color: "#E0AF0B" });
        break;
      case "installing":
        setStatus({ text: "Installing node_modules...", color: "#E0AF0B" });
        break;
      case "mounting":
        setStatus({ text: "Mounting files...", color: "#E0AF0B" });
        break;
      case "none":
        setStatus({ text: "Not ready", color: "#E0AF0B" });
        break;
      case "error":
        setStatus({ text: "Error", color: "#D64545" });
        break;
    }
  }, [webContainerStatus]);

  /* ----------------- editor helpers ----------------- */
  const clearHighlightFx = () =>
    viewRef.current?.dispatch({ effects: clearHighlight.of(null) });

  const highlightLine = (line: number) => {
    const view = viewRef.current;
    if (!view) return;
    const { doc } = view.state;
    // Babel line numbers are 1-based, and so is doc.line().
    if (line < 1 || line > doc.lines) return;
    try {
      const info = doc.line(line);
      // Mark decorations may not be empty — highlight empty lines with a
      // line decoration instead.
      const deco = Decoration.set([
        info.from === info.to
          ? Decoration.line({
              attributes: { class: "cm-debugger-highlight" },
            }).range(info.from)
          : Decoration.mark({
              attributes: { class: "cm-debugger-highlight" },
            }).range(info.from, info.to),
      ]);
      view.dispatch({
        effects: [addHighlight.of(deco)],
        selection: { anchor: info.from },
        scrollIntoView: true,
      });
    } catch (e) {
      console.error("Error highlighting line:", e);
    }
  };

  /* ----------------- run tests & collect debug data -------------- */
  useEffect(() => {
    if (!webContainer || webContainerStatus !== "ready") return;
    let cancelled = false;
    const run = async () => {
      setStatus({ text: "Running tests…", color: "#E0AF0B" });
      const t0 = performance.now();
      try {
        const proc = await webContainer.spawn("npm", ["test"]);
        await proc.exit;
      } catch (e) {
        if (!cancelled) setStatus({ text: "Test run failed", color: "#D64545" });
        console.error("Failed to run tests:", e);
        return;
      }
      const dt = Math.round(performance.now() - t0);

      const collected = await collectDebugData(webContainer.fs as any);
      if (cancelled) return;

      const totalTests = countTests(collected);
      setStats({ total: totalTests, passing: totalTests, time: `${dt}ms` });
      setSuites(collected);
      setStatus({ text: "Tests finished", color: "#3BB446" });
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [webContainer, webContainerStatus]);

  /* ----------------- step selection -> highlight ----------------- */
  const handleStepSelect = (step: DebugStep) => {
    const fileName = resolveEditorFile(step.file, filesAvailable);
    if (!fileName) {
      // Step belongs to a file the editor doesn't show (e.g. config);
      // keep the current file and just drop the highlight.
      clearHighlightFx();
      return;
    }

    if (fileName !== currentFile) {
      setCurrentFile(fileName);
      // Editor remounts on file switch; highlight once it's ready.
      if (pendingHighlight.current !== null)
        window.clearTimeout(pendingHighlight.current);
      pendingHighlight.current = window.setTimeout(() => {
        highlightLine(step.line);
        pendingHighlight.current = null;
      }, 50);
    } else {
      highlightLine(step.line);
    }
  };

  useEffect(
    () => () => {
      if (pendingHighlight.current !== null)
        window.clearTimeout(pendingHighlight.current);
    },
    []
  );

  /* ----------------- editor change ------------------------------- */
  const handleCodeChange = (code: string) => {
    setFileContents(files, currentFile, code);
    if (webContainer) {
      webContainer.fs
        .writeFile("/" + currentFile, code)
        .catch((e: unknown) =>
          console.error("Failed to sync file to container:", e)
        );
    }
  };

  /* ----------------- JSX ----------------------------------------- */
  return (
    <div className="flex flex-col h-screen w-full bg-[#1e1e1e] text-[#e0e0e0] font-sans">
      {/* main split */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* editor pane */}
        <div className="flex flex-col flex-1 min-w-[300px] overflow-hidden">
          {/* header */}
          <div className="flex justify-between bg-[#252526] border-b border-[#333]">
            <div className="flex">
              {filesAvailable.map((f) => (
                <button
                  key={f}
                  className={`px-4 py-2 text-sm border-r border-[#252526] relative ${
                    currentFile === f
                      ? "bg-[#1e1e1e] text-white after:absolute after:h-[2px] after:bg-[#007acc] after:bottom-0 after:left-0 after:right-0"
                      : "text-[#969696] hover:text-white hover:bg-[#2a2d2e]"
                  }`}
                  onClick={() => {
                    clearHighlightFx();
                    setCurrentFile(f);
                  }}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* debugger toggle */}
            <div className="flex items-center pr-2">
              <button
                title="Toggle Debugger"
                className={`w-7 h-7 flex items-center justify-center rounded-sm transition ${
                  showDebugger
                    ? "bg-[#007acc] text-white"
                    : "bg-[#3c3c3c] text-[#cccccc] hover:bg-[#4c4c4c]"
                }`}
                onClick={() => {
                  clearHighlightFx();
                  setShowDebugger((v) => !v);
                }}
              >
                🐞
              </button>
            </div>
          </div>

          {/* CodeMirror host */}
          <div className="relative flex-1 overflow-y-auto bg-[#1e1e1e]">
            <CodeEditor
              currentFile={currentFile}
              onChange={handleCodeChange}
              onReady={(v) => (viewRef.current = v)}
            />
          </div>
        </div>

        {/* debugger pane */}
        {showDebugger && (
          <div className="flex flex-col w-[400px] border-l border-[#333] bg-[#252526]">
            {/* test list */}
            <div className="h-[300px] border-b border-[#333] overflow-hidden">
              <TestList suites={suites} onSelect={setDebugSteps} />
            </div>

            {/* step debugger */}
            <div className="flex-1 overflow-hidden">
              {debugSteps ? (
                <DebuggerPanel
                  steps={debugSteps}
                  onStepSelect={handleStepSelect}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[#888] text-sm">
                  Select a test to debug
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* status bar */}
      <div
        className="flex h-[24px] text-xs px-6 w-full"
        style={{ background: status.color }}
      >
        <div className="flex flex-1 items-center gap-2 ml-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: status.color === "#007acc" ? "#3BB446" : status.color,
            }}
          />
          <span>{status.text}</span>
        </div>

        <div className="opacity-80 flex flex-1 items-center ">
          <span className="w-full text-center">{stats.time}</span>
        </div>

        <div className="flex flex-1 gap-4 items-center  justify-end mr-2">
          <span>
            TESTS:&nbsp;<span>{stats.passing}</span>/<span>{stats.total}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default WebContainerDebugger;
