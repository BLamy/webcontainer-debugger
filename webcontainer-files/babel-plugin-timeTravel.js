// timeTravelPlugin.js
export default function timeTravelPlugin(babel) {
    const { types: t } = babel;
  
    /* -------------------------------------------------- *
     * Helpers                                            *
     * -------------------------------------------------- */
  
    const DEFAULT_MAX_VARS = 10;
  
    /** Build { get a() { … }, … } — TDZ-safe getters */
    function buildVarsObjectAst(names, max) {
      // ... (keep existing buildVarsObjectAst implementation)
      const props = [];
      const validNames = Array.from(names || []).filter(n => typeof n === 'string');
      const sorted = validNames.sort();
  
      for (let i = 0; i < sorted.length && i < max; i++) {
        const name = sorted[i];
        if (name === 'arguments') continue;
  
        props.push(
          t.objectMethod(
            'get',
            t.identifier(name),
            [],
            t.blockStatement([
              t.tryStatement(
                t.blockStatement([t.returnStatement(t.identifier(name))]),
                t.catchClause(
                  t.identifier('e'),
                  t.blockStatement([t.returnStatement(t.identifier('undefined'))])
                )
              ),
            ]),
            false, false, false, false
          )
        );
      }
      return t.objectExpression(props);
    }
  
    /** Sanitize string for use in file paths */
    function sanitizeForPath(str) {
      if (typeof str !== 'string') return '_invalid_';
      // Replace common problematic characters with underscores
      return str.replace(/[\s\\/?:*|"<>]/g, '_').replace(/_+/g, '_'); // Collapse multiple underscores
    }
  
    /** Generate runtime stub AST for file system logging */
    function createRuntimeStubAst() {
      // --- AST for code to be generated ---
      /*
      if (!globalThis.__recordStep) {
        const fs = require('fs');
        const path = require('path');
  
        // Function to ensure directory exists (avoids race conditions)
        const ensureDirSync = (dirPath) => {
          try {
            fs.mkdirSync(dirPath, { recursive: true });
          } catch (err) {
            // Ignore EEXIST error (directory already exists)
            if (err.code !== 'EEXIST') {
              console.error(`[TimeTravelPlugin] Error creating directory ${dirPath}:`, err);
              throw err; // Rethrow other errors
            }
          }
        };
  
        let stepNumber = 0;
        globalThis.__recordStep = (f, l, v, sName, tName) => {
          const clonedVars = {};
          try {
            // Use Object.getOwnPropertyNames for potentially non-enumerable properties
            for (const k of Object.getOwnPropertyNames(v)) {
              // Access via getter to handle potential TDZ or errors gracefully
               try {
                   clonedVars[k] = v[k];
               } catch (_getterErr) {
                   clonedVars[k] = undefined; // Or some indicator of error
               }
            }
          } catch (_cloneErr) {
              console.error("[TimeTravelPlugin] Error cloning variables for step:", _cloneErr);
          }
  
          const stepData = {
            stepNumber: stepNumber++,
            file: f,
            line: l,
            vars: clonedVars,
            ts: Date.now(),
            suite: sName,
            test: tName
          };
  
          try {
            // Construct path: [process.cwd()]/.timetravel/sanitized_suite/sanitized_test/line.json
            const dirPath = path.join(sName, tName);
            const fullDirPath = ensureDirSync(dirPath); // Returns full path with process.cwd()/.timetravel
            const filePath = path.join(fullDirPath, `${stepNumber}.json`);
  
            // Write the file synchronously
            fs.writeFileSync(filePath, JSON.stringify(stepData, null, 2)); // Pretty print JSON
  
          } catch (writeErr) {
            console.error(`[TimeTravelPlugin] Error writing step file ${filePath}:`, writeErr);
            // Decide if you want to swallow the error or stop execution
          }
        };
        // Mark the function itself to avoid instrumenting *its* creation
        globalThis.__recordStep._generated_by_plugin_ = true;
      }
      */
  
      // --- Build the AST ---
  
      // require('fs')
      const requireFs = t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier('fs'),
          t.callExpression(t.identifier('require'), [t.stringLiteral('fs')])
        ),
      ]);
      // require('path')
      const requirePath = t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier('path'),
          t.callExpression(t.identifier('require'), [t.stringLiteral('path')])
        ),
      ]);
  
      // ensureDirSync function AST
      const ensureDirSyncFunc = t.variableDeclaration('const', [
          t.variableDeclarator(
              t.identifier('ensureDirSync'),
              t.arrowFunctionExpression(
                  [t.identifier('dirPath')], // param
                  t.blockStatement([ // body
                      // Use process.cwd() as base directory instead of absolute paths
                      t.variableDeclaration('const', [
                          t.variableDeclarator(
                              t.identifier('fullPath'),
                              t.callExpression(
                                  t.memberExpression(t.identifier('path'), t.identifier('join')),
                                  [
                                      t.callExpression(
                                          t.memberExpression(t.identifier('process'), t.identifier('cwd')),
                                          []
                                      ),
                                      t.stringLiteral('.timetravel'),
                                      t.identifier('dirPath')
                                  ]
                              )
                          )
                      ]),
                      t.tryStatement(
                          // try block
                          t.blockStatement([
                              t.expressionStatement(
                                  t.callExpression(
                                      t.memberExpression(t.identifier('fs'), t.identifier('mkdirSync')),
                                      [
                                          t.identifier('fullPath'),
                                          t.objectExpression([
                                              t.objectProperty(t.identifier('recursive'), t.booleanLiteral(true))
                                          ])
                                      ]
                                  )
                              )
                          ]),
                          // catch block
                          t.catchClause(
                              t.identifier('err'), // catch param
                              t.blockStatement([ // catch body
                                  t.ifStatement(
                                      t.binaryExpression('!==',
                                          t.memberExpression(t.identifier('err'), t.identifier('code')),
                                          t.stringLiteral('EEXIST')
                                      ),
                                      t.blockStatement([ // if body
                                           t.expressionStatement(t.callExpression( // console.error(...)
                                              t.memberExpression(t.identifier('console'), t.identifier('error')),
                                              [
                                                  t.templateLiteral(
                                                      [
                                                          t.templateElement({ raw: '[TimeTravelPlugin] Error creating directory '}),
                                                          t.templateElement({ raw: ':'}, true) // tail=true
                                                      ],
                                                      [t.identifier('fullPath')] // expression placeholder
                                                  ),
                                                   t.identifier('err')
                                              ]
                                          )),
                                          t.throwStatement(t.identifier('err')) // Rethrow
                                      ])
                                      // no else block
                                  )
                              ])
                          )
                          // no finally block
                      ),
                      // Return the full path so it can be used later
                      t.returnStatement(t.identifier('fullPath'))
                  ])
              )
          )
      ]);
  
  
      // Body of the __recordStep function AST
      const recordStepBody = t.blockStatement([
        // ++stepNumber; (Prefix increment)
        t.expressionStatement(
            t.updateExpression('++', t.identifier('stepNumber'), true /* prefix */)
        ),
        // const clonedVars = {};
        t.variableDeclaration('const', [
          t.variableDeclarator(t.identifier('clonedVars'), t.objectExpression([])),
        ]),
         // try { for (...) { try { clonedVars[k] = v[k]; } catch {}}} catch {}
         t.tryStatement(
             t.blockStatement([
                  t.forOfStatement(
                      t.variableDeclaration('const', [t.variableDeclarator(t.identifier('k'))]),
                      t.callExpression(
                          t.memberExpression(t.identifier('Object'), t.identifier('getOwnPropertyNames')),
                          [t.identifier('v')]
                      ),
                       // Inner try-catch for getter access
                      t.blockStatement([
                           t.tryStatement(
                               t.blockStatement([ // try: clonedVars[k] = v[k]
                                   t.expressionStatement(
                                       t.assignmentExpression('=',
                                           t.memberExpression(t.identifier('clonedVars'), t.identifier('k'), true),
                                           t.memberExpression(t.identifier('v'), t.identifier('k'), true)
                                       )
                                   )
                               ]),
                               t.catchClause( // catch(_getterErr) { clonedVars[k] = undefined }
                                   t.identifier('_getterErr'),
                                    t.blockStatement([
                                         t.expressionStatement(
                                              t.assignmentExpression('=',
                                                  t.memberExpression(t.identifier('clonedVars'), t.identifier('k'), true),
                                                  t.identifier('undefined')
                                              )
                                          )
                                    ])
                               )
                           )
                      ])
                  )
             ]),
              t.catchClause(t.identifier('_cloneErr'), t.blockStatement([
                   t.expressionStatement(t.callExpression( // console.error(...)
                       t.memberExpression(t.identifier('console'), t.identifier('error')),
                       [ t.stringLiteral('[TimeTravelPlugin] Error cloning variables for step:'), t.identifier('_cloneErr') ]
                   ))
              ]))
         ),
  
        // const stepData = { ... };
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier('stepData'),
            t.objectExpression([
              t.objectProperty(t.identifier('stepNumber'), t.identifier('stepNumber')),
              t.objectProperty(t.identifier('file'), t.identifier('f')),
              t.objectProperty(t.identifier('line'), t.identifier('l')),
              t.objectProperty(t.identifier('vars'), t.identifier('clonedVars')),
              t.objectProperty(
                t.identifier('ts'),
                t.callExpression(t.memberExpression(t.identifier('Date'), t.identifier('now')), [])
              ),
               // Add suite and test names
              t.objectProperty(t.identifier('suite'), t.identifier('sName')),
              t.objectProperty(t.identifier('test'), t.identifier('tName')),
            ])
          ),
        ]),
  
        // Define dirPath and filePath outside the try block so they're accessible in the catch block
        // --> ADD SANITIZATION FOR tName <--

        t.variableDeclaration('const', [
            t.variableDeclarator(
                t.identifier('sanitizedTestName'),
                t.callExpression(
                    t.memberExpression(
                        t.callExpression( // tName.replace(/[\s\\/?:*|"<>]/g, '_')
                           t.memberExpression(t.identifier('tName'), t.identifier('replace')),
                           [t.regExpLiteral('[\\s\\\\/?\:\*\|"<>\.]', 'g'), t.stringLiteral('_')] // Escaped regex
                        ),
                        t.identifier('replace')
                    ),
                   [t.regExpLiteral('_+', 'g'), t.stringLiteral('_')] // .replace(/_+/g, '_')
                )
            )
        ]),
        // const dirPath = path.join(sName, tName); <--- CHANGE tName to sanitizedTestName
        t.variableDeclaration('const', [
            t.variableDeclarator(
                t.identifier('dirPath'),
                t.callExpression(
                    t.memberExpression(t.identifier('path'), t.identifier('join')),
                    // Use sanitized name here
                    [t.identifier('sName'), t.identifier('sanitizedTestName')]
                )
            )
        ]),
        // try { ... fs operations ... } catch { ... }
         t.tryStatement(
             // try block
             t.blockStatement([
                  // ensureDirSync(dirPath) returns the full path
                  t.variableDeclaration('const', [
                      t.variableDeclarator(
                          t.identifier('fullDirPath'),
                          t.callExpression(t.identifier('ensureDirSync'), [t.identifier('dirPath')])
                      )
                  ]),
                  // const filePath = path.join(fullDirPath, `${l}.json`);
                  t.variableDeclaration('const', [
                      t.variableDeclarator(
                          t.identifier('filePath'),
                          t.callExpression(
                              t.memberExpression(t.identifier('path'), t.identifier('join')),
                              [
                                  t.identifier('fullDirPath'),
                                  t.templateLiteral( // `${stepNumber}.json`
                                      [ t.templateElement({ raw: ''}), t.templateElement({ raw: '.json'}, true) ], // quasis
                                      [ t.identifier('stepNumber') ] // expression placeholder changed to stepNumber
                                  )
                              ]
                          )
                      )
                  ]),
                   // fs.writeFileSync(filePath, JSON.stringify(stepData, null, 2));
                  t.expressionStatement(
                      t.callExpression(
                          t.memberExpression(t.identifier('fs'), t.identifier('writeFileSync')),
                          [
                              t.identifier('filePath'),
                              t.callExpression( // JSON.stringify(stepData, null, 2)
                                  t.memberExpression(t.identifier('JSON'), t.identifier('stringify')),
                                  [t.identifier('stepData'), t.nullLiteral(), t.numericLiteral(2)]
                              )
                          ]
                      )
                  )
             ]),
              // catch(writeErr) { ... }
              t.catchClause(
                  t.identifier('writeErr'),
                  t.blockStatement([
                       t.expressionStatement(t.callExpression( // console.error(...)
                          t.memberExpression(t.identifier('console'), t.identifier('error')),
                          [
                               t.templateLiteral(
                                  [
                                      t.templateElement({ raw: '[TimeTravelPlugin] Error writing step file ' }),
                                      t.templateElement({ raw: ':' }, true)
                                  ],
                                  [t.identifier('filePath')]
                              ),
                              t.identifier('writeErr')
                          ]
                      ))
                  ])
              )
         ) // end try-catch for file writing
      ]);
  
      // globalThis.__recordStep = (f, l, v, sName, tName) => { ... recordStepBody ... };
      const assignFn = t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.identifier('globalThis'), t.identifier('__recordStep')),
          t.arrowFunctionExpression(
            [ // Params: f, l, v, sName, tName
              t.identifier('f'), t.identifier('l'), t.identifier('v'),
              t.identifier('sName'), t.identifier('tName')
            ],
            recordStepBody // Body AST defined above
          )
        )
      );
       // Add marker to the assignment expression's node itself to prevent instrumentation later
       assignFn.expression.right._generated_by_plugin_ = true; // Mark the ArrowFunctionExpression
  
  
      // if (!globalThis.__recordStep) { requireFs; requirePath; ensureDirSyncFunc; assignFn; }
      const ifStmt = t.ifStatement(
        t.unaryExpression('!', t.memberExpression(t.identifier('globalThis'), t.identifier('__recordStep'))),
        // Consequent block
        t.blockStatement([
            requireFs,
            requirePath,
            ensureDirSyncFunc,
            // Add: let stepNumber = 0;
            t.variableDeclaration('let', [
                t.variableDeclarator(t.identifier('stepNumber'), t.numericLiteral(0))
            ]),
            assignFn // Assign the function
          ])
        // No Alternate
      );
      ifStmt._generated_by_babel_plugin_time_travel_stub = true; // Mark the IfStatement itself
      return [ifStmt];
    }
  
    /* -------------------------------------------------- *
     * Nodes we never instrument                          *
     * -------------------------------------------------- */
    const STATEMENTS_TO_SKIP = new Set([
      'FunctionDeclaration', 'ClassDeclaration', 'IfStatement', 'SwitchStatement',
      'WhileStatement', 'DoWhileStatement', 'ForStatement', 'ForInStatement',
      'ForOfStatement', 'TryStatement', 'CatchClause', 'LabeledStatement',
      'ReturnStatement', 'BreakStatement', 'ContinueStatement', 'ThrowStatement',
      'DebuggerStatement', 'EmptyStatement', 'BlockStatement', 'WithStatement',
      'SwitchCase',
      'ImportDeclaration', 'ExportNamedDeclaration', 'ExportDefaultDeclaration', 'ExportAllDeclaration',
      // Skip instrumentation inside the stub itself
      'VariableDeclaration', 'ExpressionStatement', // Be careful with these, rely on the parent marker
    ]);
  
    /* -------------------------------------------------- *
     * Plugin visitor                                     *
     * -------------------------------------------------- */
    return {
      name: 'time-travel-instrumentation-fs',
      visitor: {
        Program: {
          enter(path, state) {
            // ... (keep existing injection check logic, it's still valid for the 'if' structure)
            let alreadyInjected = false;
            path.get('body').forEach(statementPath => {
               if (statementPath.isIfStatement() && statementPath.node._generated_by_babel_plugin_time_travel_stub) {
                 alreadyInjected = true;
               }
               // Add a check for the structure just in case marker is lost (less reliable)
               else if (statementPath.isIfStatement()) {
                 const test = statementPath.get('test');
                 if (test.isUnaryExpression({ operator: '!' })) {
                    const argument = test.get('argument');
                    if (argument.isMemberExpression() &&
                        argument.get('object').isIdentifier({ name: 'globalThis' }) &&
                        argument.get('property').isIdentifier({ name: '__recordStep' }))
                    {
                       alreadyInjected = true; // Assume structural match means injected
                    }
                 }
               }
            });
  
            if (!alreadyInjected) {
               const stubNodes = createRuntimeStubAst();
               if (Array.isArray(stubNodes) && stubNodes.length > 0 && stubNodes[0]) {
                  path.unshiftContainer('body', stubNodes);
               } else {
                   console.error("[timeTravelPlugin] Internal error: createRuntimeStubAst did not return a valid node array.");
               }
            }
          },
        },
  
        Statement: {
          enter(path, state) {

            // Prevent instrumenting recorder calls or code within the generated stub block
             // Check marker on the node itself or any parent
             if (path.node._is_recorder_call || path.findParent(p => p.node._generated_by_babel_plugin_time_travel_stub || p.node._generated_by_plugin_)) {
                 return;
             }
  
  
             // Prevent instrumenting function expressions/declarations used *within* the stub
              if (path.findParent(p => p.isArrowFunctionExpression() && p.node._generated_by_plugin_)) {
                   return;
              }
  
  
            // Skip statements without location or explicitly skipped types
            if (!path.node.loc || STATEMENTS_TO_SKIP.has(path.node.type) || !path.isStatement()) {
              // Allow specific types if needed, but be cautious
               if (!(t.isVariableDeclaration(path.node) || t.isExpressionStatement(path.node))) {
                    return;
               }
            }
  
            // Skip ExpressionStatements containing only function/class expressions
            if (t.isExpressionStatement(path.node) &&
                (t.isFunctionExpression(path.node.expression) ||
                 t.isArrowFunctionExpression(path.node.expression) ||
                 t.isClassExpression(path.node.expression))) {
              return;
            }
  
            /* Collect bindings and referenced identifiers */
            // ... (keep existing logic for collecting `allNames`)
            const bindingMap = path.scope?.getAllBindings?.() ?? {};
            const allNames = new Set(Object.keys(bindingMap));
            path.traverse({ /* ... keep existing Identifier traversal ... */
                  Identifier(idPath) {
                  // Don't traverse into nested scopes defined within this statement
                  if (idPath.scope.parent !== path.scope && idPath.scope !== path.scope) {
                      idPath.skip();
                      return;
                  }
  
                  const { node, parent } = idPath;
                  const name = node.name;
  
                  // Skip if it's already a known binding, undefined, or arguments
                  if ( allNames.has(name) || name === 'undefined' || name === 'arguments') return;
  
                  // Skip if it's not referenced (e.g., a declaration itself, label)
                  if (!idPath.isReferencedIdentifier()) return;
  
                  // Skip if used as a property name
                  if (
                      ((t.isMemberExpression(parent) || t.isOptionalMemberExpression(parent)) && parent.property === node && !parent.computed) ||
                      ((t.isObjectProperty(parent) || t.isClassProperty(parent) || t.isObjectMethod(parent) || t.isClassMethod(parent)) && parent.key === node && !parent.computed) ||
                      (t.isLabeledStatement(parent) && parent.label === node) ||
                      (t.isBreakStatement(parent) && parent.label === node) ||
                      (t.isContinueStatement(parent) && parent.label === node)
                  ) {
                      return;
                  }
  
                  // Add potentially global identifiers (like console, Promise, fs, path etc.)
                  allNames.add(name);
                  },
             });
  
  
            /* max vars option */
            const maxVars = state.opts?.maxVars ?? DEFAULT_MAX_VARS;
            if (maxVars <= 0 || !path.node.loc) return;
  
            /* build recorder call - NOW INCLUDES suiteName and testName */
            const line = path.node.loc.start.line;
            const file = state.file.opts.filename || 'unknown';
            // Get suite/test names from plugin options, sanitize them
            const suiteName = sanitizeForPath(state.opts?.suiteName || 'DefaultSuite');
  
            const varsObjectAst = buildVarsObjectAst(allNames, maxVars);
            if (!varsObjectAst || !t.isNode(varsObjectAst)) {
               console.error(`[timeTravelPlugin] Failed to build vars object for ${file}:${line}`);
               return;
            }
  
            // Call __recordStep(file, line, varsObj, suiteName, testName)
            const recorderCall = t.callExpression(
              t.identifier('__recordStep'),
              [
                t.stringLiteral(file),
                t.numericLiteral(line),
                varsObjectAst,
                t.stringLiteral(suiteName), // Add suite name
                t.logicalExpression(
                  '??',
                  t.memberExpression(t.identifier('globalThis'), t.identifier('__testName')),
                  t.stringLiteral('UnknownTest')
                )
              ]
            );
  
            const recorderStatement = t.expressionStatement(recorderCall);
            recorderStatement._is_recorder_call = true; // Mark the statement itself
  
            /* insert AFTER current statement */
            // ... (keep existing insertion logic)
             if (path.isStatement() && path.node.loc && (path.parentPath.isBlockStatement() || path.parentPath.isProgram())) {
               try {
                  path.insertAfter(recorderStatement);
               } catch (e) {
                  console.error(`[timeTravelPlugin] Error inserting recorder call after ${file}:${line}: ${e.message}`);
               }
            } else {
               // Attempt to wrap if not in a block
               if (path.isStatement() && !path.isBlockStatement() && (path.parentPath.isIfStatement() || path.parentPath.isLoop())) {
                   try {
                      const block = t.blockStatement([path.node, recorderStatement]);
                      path.replaceWith(block);
                   } catch (e) {
                      console.error(`[timeTravelPlugin] Error wrapping statement in block for ${file}:${line}: ${e.message}`);
                   }
               }
            }
          },
        },

        // --> NEW VISITOR for CallExpression <--
        CallExpression(path, state) {
          const callee = path.get('callee');
          // Check if it's a call to 'it' or 'test'
          if (callee.isIdentifier({ name: 'it' }) || callee.isIdentifier({ name: 'test' })) {
            const args = path.get('arguments');
            // Ensure there are arguments and the first is a string literal (test name)
            if (args.length > 0 && args[0].isStringLiteral()) {
              const testName = args[0].node.value;

              // Find the test function (usually the last argument)
              const testFunctionPath = args[args.length - 1];

              if (testFunctionPath && (testFunctionPath.isFunctionExpression() || testFunctionPath.isArrowFunctionExpression())) {
                const bodyPath = testFunctionPath.get('body');
                // Ensure the body is a block statement
                if (bodyPath.isBlockStatement()) {
                   // Build the AST for: globalThis.__testName = "testName";
                   const assignmentAst = t.expressionStatement(
                       t.assignmentExpression(
                           '=',
                           t.memberExpression(t.identifier('globalThis'), t.identifier('__testName')),
                           t.stringLiteral(testName)
                       )
                   );
                   // Add a marker to avoid re-instrumenting this injected code
                   assignmentAst._generated_by_plugin_ = true;

                   // Inject the assignment at the beginning of the function body
                   try {
                       bodyPath.unshiftContainer('body', assignmentAst);
                   } catch (e) {
                        console.error(`[timeTravelPlugin] Error injecting test name for "${testName}": ${e.message}`);
                   }
                }
              }
            }
          }
        },
      },
    };
  }