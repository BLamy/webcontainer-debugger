// File: webcontainer-files/.babel/plugins/debugger-instrumentation/index.js
// Patched 2025‑05‑01 — fixes failing tests:
//   • Suite path is now captured **at runtime** via globalThis.__currentSuite so
//     steps inside helper/utility functions end up in the same folder as the
//     test that called them.
//   • If‑statements and throw‑statements are now instrumented so we log state
//     after control‑flow checks (line 9) and immediately **before** a `throw`
//     (line 10) without relying on the body executing.
//   • Adds a tiny runtime helper that keeps track of the current suite path.
//   • Removes hard‑coded "fixture.js" confusion: the `file` key is still the
//     absolute path Babel knows about (that’s the *referenced* file), but the
//     directory structure is now entirely driven by `__currentSuite`, so every
//     step from the same test lands together.

import path from "path";

export default function debuggerInstrumentation(babel) {
  const { types: t } = babel;

  /* -------------------------------------------------- *
   * Helpers                                            *
   * -------------------------------------------------- */

  const DEFAULT_MAX_VARS = 10;

  /** Build { get a() { try{ return a }catch{ return undefined } }, ... } */
  function buildVarsObjectAst(names, max) {
    const props = [];
    const sorted = Array.from(names || []).filter(Boolean).sort();
    for (let i = 0; i < sorted.length && i < max; i++) {
      const name = sorted[i];
      if (name === "arguments") continue; // pseudo‑var can break getters
      props.push(
        t.objectMethod(
          "get",
          t.identifier(name),
          [],
          t.blockStatement([
            t.tryStatement(
              t.blockStatement([t.returnStatement(t.identifier(name))]),
              t.catchClause(
                t.identifier("e"),
                t.blockStatement([t.returnStatement(t.identifier("undefined"))])
              )
            ),
          ])
        )
      );
    }
    return t.objectExpression(props);
  }

  /** Replace path‑unsafe chars → '_'  */
  function sanitizeForPath(str) {
    return typeof str === "string"
      ? str.replace(/[\s\\/?:*|"<>.]/g, "_").replace(/_+/g, "_")
      : "_invalid_";
  }

  /* -------------------------------------------------- *
   * Runtime stub (FS write & helpers)                  *
   * -------------------------------------------------- */
  function createRuntimeStubAst(defaultSuite, outDir) {
    const stub = babel.template.statement(
      `
      if (!globalThis.__recordStep) {
        const fs = require("fs");
        const path = require("path");
        const ensureDirSync = (dirPath) => {
          // resolve (not join) so an absolute outDir is honoured as-is
          const fullPath = path.resolve(process.cwd(), ${JSON.stringify(outDir)}, dirPath);
          try {
            fs.mkdirSync(fullPath, { recursive: true });
          } catch (err) {
            if (err.code !== "EEXIST") {
              console.error("[TimeTravelPlugin] Error creating directory ", err);
              throw err;
            }
          }
          return fullPath;
        };
        let stepNumber = 0;
        globalThis.__resetStepCounter = () => {
          stepNumber = 0;
        };
        globalThis.__currentSuite = globalThis.__currentSuite ?? ${JSON.stringify(
          defaultSuite
        )};
        const safeStringify = (obj) => {
          const seen = new WeakSet();
          return JSON.stringify(
            obj,
            (key, value) => {
              if (typeof value === "bigint") return value.toString() + "n";
              if (typeof value === "function") return "[Function]";
              if (typeof value === "symbol") return value.toString();
              if (value && typeof value === "object") {
                if (seen.has(value)) return "[Circular]";
                seen.add(value);
              }
              return value;
            },
            2
          );
        };
        let __tt_recording = false;
        globalThis.__recordStep = (f, l, v, sName, tName) => {
          // Re-entrancy guard: capturing vars can invoke user getters (and
          // JSON.stringify invokes enumerable getters), which may themselves
          // be instrumented and call __recordStep again — recursing forever.
          if (__tt_recording) return;
          __tt_recording = true;
          try {
            stepNumber++;
            const clonedVars = {};
            for (const k of Object.getOwnPropertyNames(v)) {
              try {
                clonedVars[k] = v[k];
              } catch (_e) {
                clonedVars[k] = undefined;
              }
            }
            const stepData = {
              stepNumber: stepNumber,
              file: f,
              line: l,
              vars: clonedVars,
              ts: Date.now(),
              suite: sName,
              test: tName,
            };
            const sanTest = String(tName)
              .replace(/[\\s\\\\/?:*|"<>.()\\[\\]]/g, "_")
              .replace(/_+/g, "_");
            const dirPath = path.join(String(sName), sanTest);
            const fullDirPath = ensureDirSync(dirPath);
            const filePath = path.join(fullDirPath, stepNumber + ".json");
            let json;
            try {
              json = safeStringify(stepData);
            } catch (serErr) {
              // A hostile value (e.g. a throwing enumerable getter) poisoned
              // serialization. Retry var-by-var so one bad value doesn't
              // drop the whole step.
              const fallbackVars = {};
              for (const k of Object.keys(clonedVars)) {
                try {
                  fallbackVars[k] = JSON.parse(safeStringify(clonedVars[k]) ?? "null");
                } catch (_e) {
                  fallbackVars[k] = "[Unserializable]";
                }
              }
              stepData.vars = fallbackVars;
              json = safeStringify(stepData);
            }
            fs.writeFileSync(filePath, json);
          } catch (err) {
            // Instrumentation must never break the code under test.
            console.error("[TimeTravelPlugin] Failed to record step", err);
          } finally {
            __tt_recording = false;
          }
        };
      }
      `,
      { preserveComments: true, placeholderPattern: false }
    )();

    stub._generated_by_babel_plugin_time_travel_stub = true;
    // Mark every node in the stub so visitors skip it entirely.
    (function markGenerated(node) {
      if (!node || typeof node.type !== "string") return;
      node._generated_by_plugin_ = true;
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) value.forEach(markGenerated);
        else if (value && typeof value.type === "string") markGenerated(value);
      }
    })(stub);

    return [stub];
  }

  /* -------------------------------------------------- *
   * Nodes we do NOT instrument                         *
   * -------------------------------------------------- */
  const STATEMENTS_TO_SKIP = new Set([
    "FunctionDeclaration",
    "ClassDeclaration",
    // deliberately *not* skipping IfStatement or ThrowStatement now
    "SwitchStatement",
    "WhileStatement",
    "DoWhileStatement",
    "ForStatement",
    "ForInStatement",
    "ForOfStatement",
    "TryStatement",
    "CatchClause",
    "LabeledStatement",
    "ReturnStatement",
    "BreakStatement",
    "ContinueStatement",
    "DebuggerStatement",
    "EmptyStatement",
    "BlockStatement",
    "WithStatement",
    "SwitchCase",
    "ImportDeclaration",
    "ExportNamedDeclaration",
    "ExportDefaultDeclaration",
    "ExportAllDeclaration",
  ]);

  /* -------------------------------------------------- *
   * Recorder helper                                    *
   * -------------------------------------------------- */
  function createRecorderStatement(path, state, lineOverride = null, namesOverride = null) {
    if (
      path.node._is_recorder_call ||
      path.findParent(p => p.node._generated_by_babel_plugin_time_travel_stub || p.node._generated_by_plugin_)
    )
      return null;

    if (!path.node.loc) return null;

    const line = lineOverride ?? path.node.loc.start.line;
    const file = state.file.opts.filename || "unknown";

    const maxVars = state.opts?.maxVars ?? DEFAULT_MAX_VARS;
    if (maxVars <= 0) return null;

    let names;
    if (namesOverride) {
      names = namesOverride;
    } else {
      names = new Set(Object.keys(path.scope?.getAllBindings?.() || {}));
      try {
        if (typeof path.traverse === "function") {
          path.traverse({
            Identifier(idP) {
              if (!idP.isReferencedIdentifier()) return;
              const n = idP.node.name;
              names.add(n);
            },
          });
        }
      } catch (e) {
        console.error("[timeTravelPlugin] traverse error", e);
      }
    }

    const varsObj = buildVarsObjectAst(names, maxVars);

    // Runtime suite path (globalThis.__currentSuite ?? default)
    const suiteExpr = t.logicalExpression(
      "??",
      t.memberExpression(t.identifier("globalThis"), t.identifier("__currentSuite")),
      t.stringLiteral(sanitizeForPath(state.opts?.suiteName || "DefaultSuite"))
    );

    const recorderCall = t.callExpression(t.identifier("__recordStep"), [
      t.stringLiteral(file),
      t.numericLiteral(line),
      varsObj,
      suiteExpr,
      t.logicalExpression(
        "??",
        t.memberExpression(t.identifier("globalThis"), t.identifier("__testName")),
        t.stringLiteral("UnknownTest")
      ),
    ]);

    const stmt = t.expressionStatement(recorderCall);
    stmt._is_recorder_call = true;
    return stmt;
  }

  /* -------------------------------------------------- *
   * Visitor                                             *
   * -------------------------------------------------- */
  return {
    name: "time-travel-instrumentation-fs",
    visitor: {
      Program: {
        enter(programPath, state) {
          // ---- inject stub (only once) ----
          let hasStub = false;
          programPath.get("body").forEach(p => {
            if (p.isIfStatement() && p.node._generated_by_babel_plugin_time_travel_stub) hasStub = true;
          });
          if (!hasStub) {
            const defaultSuite = sanitizeForPath(state.opts?.suiteName || "DefaultSuite");
            const outDir = state.opts?.outDir || ".timetravel";
            programPath.unshiftContainer("body", createRuntimeStubAst(defaultSuite, outDir));
          }
        },
      },
      // -------------- describe / it wrappers --------------
      CallExpression(path, state) {
        const callee = path.get("callee");
        if (!callee.isIdentifier()) return;
        const name = callee.node.name;

        // --------- DESCRIBE("…", fn) ---------
        if (name === "describe") {
          // Guard against re-processing: replaceWith below requeues the new
          // body for traversal, which would re-visit (and re-wrap) nested
          // describe calls forever.
          if (path.node._tt_suite_wrapped) return;
          path.node._tt_suite_wrapped = true;
          const [titleNode, fnNode] = path.get("arguments");
          if (!titleNode?.isStringLiteral()) return;
          const suiteName = sanitizeForPath(titleNode.node.value);
          if (!fnNode || !(fnNode.isFunctionExpression() || fnNode.isArrowFunctionExpression())) return;
          let bodyP = fnNode.get("body");
          if (!bodyP.isBlockStatement()) {
            bodyP.replaceWith(t.blockStatement([t.returnStatement(bodyP.node)]));
            bodyP = fnNode.get("body");
          }
          // ---- PUSH suiteName onto a stack ---------------------------------
          const pushStmts = [
            // initialise the stack if absent
            t.ifStatement(
              t.unaryExpression("!",
                t.memberExpression(t.identifier("globalThis"), t.identifier("__suiteStack"))
              ),
              t.expressionStatement(
                t.assignmentExpression("=",
                  t.memberExpression(t.identifier("globalThis"), t.identifier("__suiteStack")),
                  t.arrayExpression([])
                )
              )
            ),
            // push the new level
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(
                  t.memberExpression(t.identifier("globalThis"), t.identifier("__suiteStack")),
                  t.identifier("push")
                ),
                [t.stringLiteral(suiteName)]
              )
            ),
            // recompute __currentSuite
            t.expressionStatement(
              t.assignmentExpression("=",
                t.memberExpression(t.identifier("globalThis"), t.identifier("__currentSuite")),
                t.callExpression(
                  t.memberExpression(
                    t.memberExpression(t.identifier("globalThis"), t.identifier("__suiteStack")),
                    t.identifier("join")
                  ),
                  [t.stringLiteral("/")]
                )
              )
            ),
          ];
          pushStmts.forEach(s => (s._generated_by_plugin_ = true));

          // ---- POP when the block finishes --------------------------------
          const popStmts = [
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(
                  t.memberExpression(t.identifier("globalThis"), t.identifier("__suiteStack")),
                  t.identifier("pop")
                ),
                []
              )
            ),
            t.expressionStatement(
              t.assignmentExpression("=",
                t.memberExpression(t.identifier("globalThis"), t.identifier("__currentSuite")),
                t.callExpression(
                  t.memberExpression(
                    t.memberExpression(t.identifier("globalThis"), t.identifier("__suiteStack")),
                    t.identifier("join")
                  ),
                  [t.stringLiteral("/")]
                )
              )
            ),
          ];
          popStmts.forEach(s => (s._generated_by_plugin_ = true));

          // Wrap the original body in try/finally so the suite stack is
          // popped even when the body returns early (e.g. concise arrow
          // bodies rewritten to `return expr`) or throws.
          const tryStmt = t.tryStatement(
            t.blockStatement(bodyP.node.body),
            null,
            t.blockStatement(popStmts)
          );
          bodyP.replaceWith(t.blockStatement([...pushStmts, tryStmt]));
          return;
        }

        // --------- IT | TEST ("…", fn) -------------------------------------
        if (name === "it" || name === "test") {
          if (path.node._tt_test_wrapped) return;
          path.node._tt_test_wrapped = true;
          const [titleNode, fnNode] = path.get("arguments");
          if (!titleNode?.isStringLiteral()) return;
          if (!fnNode || !(fnNode.isFunctionExpression() || fnNode.isArrowFunctionExpression())) return;
          let bodyP = fnNode.get("body");
          if (!bodyP.isBlockStatement()) {
            bodyP.replaceWith(t.blockStatement([t.returnStatement(bodyP.node)]));
            bodyP = fnNode.get("body");
          }

          // Compute the suite path statically from the enclosing describe()
          // titles. Test runners like vitest execute describe callbacks at
          // collection time but test bodies later, so the runtime suite
          // stack is already unwound when the test actually runs. Assigning
          // the statically-known path here keeps steps (including those
          // recorded in helper modules the test calls into) in the right
          // suite directory.
          const suiteTitles = [];
          let ancestor = path.parentPath;
          while (ancestor) {
            if (
              ancestor.isCallExpression() &&
              ancestor.get("callee").isIdentifier({ name: "describe" })
            ) {
              const title = ancestor.get("arguments")[0];
              if (title?.isStringLiteral()) {
                suiteTitles.unshift(sanitizeForPath(title.node.value));
              }
            }
            ancestor = ancestor.parentPath;
          }
          const staticSuite = suiteTitles.length
            ? suiteTitles.join("/")
            : sanitizeForPath(state.opts?.suiteName || "DefaultSuite");

          const assignSuite = t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.identifier("globalThis"), t.identifier("__currentSuite")),
              t.stringLiteral(staticSuite)
            )
          );
          assignSuite._generated_by_plugin_ = true;
          const assignTest = t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.identifier("globalThis"), t.identifier("__testName")),
              t.stringLiteral(titleNode.node.value)
            )
          );
          assignTest._generated_by_plugin_ = true;
          bodyP.unshiftContainer("body", [assignSuite, assignTest]);
        }
      },

      // -------------- generic Statement instrumentation --------------
      Statement(path, state) {
        if (STATEMENTS_TO_SKIP.has(path.node.type)) return;
        if (
          path.isExpressionStatement() &&
          (t.isFunctionExpression(path.node.expression) || t.isArrowFunctionExpression(path.node.expression) || t.isClassExpression(path.node.expression))
        ) {
          return; // skip standalone function expressions
        }
        
        // Skip the *registration* calls themselves so we don't log them
        if (
          path.isExpressionStatement() &&
          path.get("expression").isCallExpression()
        ) {
          const callee = path.get("expression.callee");
          if (
            callee.isIdentifier({ name: "describe" }) ||
            callee.isIdentifier({ name: "it" }) ||
            callee.isIdentifier({ name: "test" })
          ) {
            return;
          }
        }
        
        const recStmt = createRecorderStatement(path, state);
        if (!recStmt) return;

        if (path.isThrowStatement()) {
          // We log **before** a throw so we still capture the state.
          path.insertBefore(recStmt);
        } else if (path.parentPath.isBlockStatement() || path.parentPath.isProgram()) {
          path.insertAfter(recStmt);
        } else if (
          !path.isBlockStatement() &&
          (path.parentPath.isIfStatement() || path.parentPath.isLoop() || path.parentPath.isWithStatement())
        ) {
          // wrap bare statements of control structures in a block
          const blk = t.blockStatement([path.node, recStmt]);
          path.replaceWith(blk);
        }
      },

      // -------------- function entry --------------
      Function(path, state) {
        if (path.node._generated_by_plugin_) return;
        if (!path.node.body || !path.node.loc) return;

        // Skip describe() callbacks — they execute at collection time, so
        // an entry step would be misattributed to whatever suite/test
        // happened to be current.
        if (
          path.parentPath.isCallExpression() &&
          path.parentPath.get("callee").isIdentifier({ name: "describe" })
        ) {
          return;
        }

        // Ensure body is a block
        let bodyP = path.get("body");
        if (!bodyP.isBlockStatement()) {
          bodyP.replaceWith(t.blockStatement([t.returnStatement(bodyP.node)]));
          bodyP = path.get("body");
        }

        const names = new Set(Object.keys(path.scope?.getAllBindings() || {}));
        if (!path.isArrowFunctionExpression()) names.add("arguments");

        const rec = createRecorderStatement(path, state, path.node.loc.start.line, names);
        if (!rec) return;

        // Insert after any statements this plugin already injected at the
        // top of the body (e.g. __currentSuite/__testName assignments for
        // it/test callbacks) so the entry step is attributed correctly.
        const body = bodyP.get("body");
        let insertIdx = 0;
        while (insertIdx < body.length && body[insertIdx].node._generated_by_plugin_) {
          insertIdx++;
        }
        if (insertIdx === 0) {
          bodyP.unshiftContainer("body", rec);
        } else {
          body[insertIdx - 1].insertAfter(rec);
        }
      },
    },
  };
}
