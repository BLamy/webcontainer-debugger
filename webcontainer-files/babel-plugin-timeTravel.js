// timeTravelPlugin.js
import { declare } from '@babel/helper-plugin-utils'; // Use declare for cleaner export if preferred

export default function timeTravelPlugin(babel) {
    const { types: t } = babel;

    /* -------------------------------------------------- *
     * Helpers                                            *
     * -------------------------------------------------- */

    const DEFAULT_MAX_VARS = 10;

    /** Build { get a() { … }, … } — TDZ-safe getters */
    function buildVarsObjectAst(names, max) {
        const props = [];
        const validNames = Array.from(names || []).filter(n => typeof n === 'string');
        const sorted = validNames.sort();

        for (let i = 0; i < sorted.length && i < max; i++) {
            const name = sorted[i];
            // Keep arguments if present in the names set
            // if (name === 'arguments') continue; // Removed this line to allow capturing 'arguments'

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
                    false, false, false, false // Static=false, generator=false, async=false, computed=false
                    // Note: We don't explicitly mark these generated getters,
                    // rely on skip logic in Function visitor based on parent structure/markers.
                )
            );
        }
        return t.objectExpression(props);
    }

    /** Sanitize string for use in file paths */
    function sanitizeForPath(str) {
      if (typeof str !== 'string') return '_invalid_';
      // Replace common problematic characters with underscores
      // Added '.' to the regex to avoid issues with file extensions in names
      return str.replace(/[\s\\/?:*|"<>.]/g, '_').replace(/_+/g, '_'); // Collapse multiple underscores
    }

    /** Generate runtime stub AST for file system logging */
    function createRuntimeStubAst() {
        // --- AST for code to be generated --- (comments kept for clarity)
        /*
        if (!globalThis.__recordStep) {
          const fs = require('fs');
          const path = require('path');

          // Function to ensure directory exists (avoids race conditions)
          const ensureDirSync = (dirPath) => {
            const fullPath = path.join(process.cwd(), '.timetravel', dirPath);
            try {
              fs.mkdirSync(fullPath, { recursive: true });
            } catch (err) {
              if (err.code !== 'EEXIST') {
                console.error(`[TimeTravelPlugin] Error creating directory ${fullPath}:`, err);
                throw err; // Rethrow other errors
              }
            }
            return fullPath; // Return the created/existing full path
          };

          let stepNumber = 0;
          globalThis.__recordStep = (f, l, v, sName, tName) => {
            stepNumber++; // Increment step number first
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
              stepNumber: stepNumber, // Use the incremented step number
              file: f,
              line: l,
              vars: clonedVars,
              ts: Date.now(),
              suite: sName,
              test: tName
            };

             let filePathForError = 'unknown path'; // Initialize for catch block
             try {
               // Construct path: [process.cwd()]/.timetravel/sanitized_suite/sanitized_test/stepNumber.json
               const sanitizedTestName = tName.replace(/[\s\\/?:*|"<>.]/g, '_').replace(/_+/g, '_');
               const dirPath = path.join(sName, sanitizedTestName);
               const fullDirPath = ensureDirSync(dirPath); // Returns full path with process.cwd()/.timetravel
               const filePath = path.join(fullDirPath, `${stepNumber}.json`); // Use stepNumber for filename
               filePathForError = filePath; // Update for potential use in catch

               // Write the file synchronously
               fs.writeFileSync(filePath, JSON.stringify(stepData, null, 2)); // Pretty print JSON

             } catch (writeErr) {
               console.error(`[TimeTravelPlugin] Error writing step file ${filePathForError}:`, writeErr);
               // Decide if you want to swallow the error or stop execution
             }
          };
          // Mark the function itself to avoid instrumenting *its* creation
          globalThis.__recordStep._generated_by_plugin_ = true;
        }
        */

        // --- Build the AST ---

        // require('fs')
        const requireFs_ = t.variableDeclaration('const', [
            t.variableDeclarator(
            t.identifier('fs'),
            t.callExpression(t.identifier('require'), [t.stringLiteral('fs')])
            ),
        ]);
        // require('path')
        const requirePath_ = t.variableDeclaration('const', [
            t.variableDeclarator(
            t.identifier('path'),
            t.callExpression(t.identifier('require'), [t.stringLiteral('path')])
            ),
        ]);

        // ensureDirSync function AST
        const ensureDirSyncFunc_ = t.variableDeclaration('const', [
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
        const recordStepBody_ = t.blockStatement([
            // ++stepNumber; (Prefix increment)
            t.expressionStatement(
                t.updateExpression('++', t.identifier('stepNumber'), /* prefix */ true)
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
                                            t.memberExpression(t.identifier('clonedVars'), t.identifier('k'), /* computed */ true),
                                            t.memberExpression(t.identifier('v'), t.identifier('k'), /* computed */ true)
                                        )
                                    )
                                ]),
                                t.catchClause( // catch(_getterErr) { clonedVars[k] = undefined }
                                    t.identifier('_getterErr'),
                                    t.blockStatement([
                                        t.expressionStatement(
                                            t.assignmentExpression('=',
                                                t.memberExpression(t.identifier('clonedVars'), t.identifier('k'), /* computed */ true),
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
                    t.objectProperty(t.identifier('stepNumber'), t.identifier('stepNumber')), // Use updated stepNumber
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

            // Define filePathForError outside the try block so it's accessible in the catch block
            t.variableDeclaration('let', [
                t.variableDeclarator(t.identifier('filePathForError'), t.stringLiteral('unknown path'))
            ]),

            // try { ... fs operations ... } catch { ... }
            t.tryStatement(
                // try block
                t.blockStatement([
                    // const sanitizedTestName = tName.replace(...)
                    t.variableDeclaration('const', [
                        t.variableDeclarator(
                            t.identifier('sanitizedTestName'),
                            t.callExpression(
                                t.memberExpression(
                                    t.callExpression( // tName.replace(/[\s\\/?:*|"<>.]/g, '_') <-- added '.'
                                    t.memberExpression(t.identifier('tName'), t.identifier('replace')),
                                    [t.regExpLiteral('[\\s\\\\/?:\*\|"<>.]', 'g'), t.stringLiteral('_')] // Escaped regex
                                    ),
                                    t.identifier('replace')
                                ),
                            [t.regExpLiteral('_+', 'g'), t.stringLiteral('_')] // .replace(/_+/g, '_')
                            )
                        )
                    ]),
                    // const dirPath = path.join(sName, sanitizedTestName);
                    t.variableDeclaration('const', [
                        t.variableDeclarator(
                            t.identifier('dirPath'),
                            t.callExpression(
                                t.memberExpression(t.identifier('path'), t.identifier('join')),
                                [t.identifier('sName'), t.identifier('sanitizedTestName')] // Use sanitized name
                            )
                        )
                    ]),
                    // const fullDirPath = ensureDirSync(dirPath);
                    t.variableDeclaration('const', [
                        t.variableDeclarator(
                            t.identifier('fullDirPath'),
                            t.callExpression(t.identifier('ensureDirSync'), [t.identifier('dirPath')])
                        )
                    ]),
                    // const filePath = path.join(fullDirPath, `${stepNumber}.json`); <-- Use stepNumber
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
                    // Update filePathForError for use in catch block if needed
                    t.expressionStatement(
                        t.assignmentExpression('=', t.identifier('filePathForError'), t.identifier('filePath'))
                    ),
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
                                    [t.identifier('filePathForError')] // Use the potentially updated path
                                ),
                                t.identifier('writeErr')
                            ]
                        ))
                    ])
                )
            ) // end try-catch for file writing
        ]);

        // globalThis.__recordStep = (f, l, v, sName, tName) => { ... recordStepBody ... };
        const assignFn_ = t.expressionStatement(
            t.assignmentExpression(
            '=',
            t.memberExpression(t.identifier('globalThis'), t.identifier('__recordStep')),
            t.arrowFunctionExpression(
                [ // Params: f, l, v, sName, tName
                t.identifier('f'), t.identifier('l'), t.identifier('v'),
                t.identifier('sName'), t.identifier('tName')
                ],
                recordStepBody_ // Body AST defined above
            )
            )
        );
        // Add marker to the assignment expression's node itself to prevent instrumentation later
        assignFn_.expression.right._generated_by_plugin_ = true; // Mark the ArrowFunctionExpression


        // if (!globalThis.__recordStep) { requireFs; requirePath; ensureDirSyncFunc; assignFn; }
        const ifStmt = t.ifStatement(
            t.unaryExpression('!', t.memberExpression(t.identifier('globalThis'), t.identifier('__recordStep'))),
            // Consequent block
            t.blockStatement([
                requireFs_,
                requirePath_,
                ensureDirSyncFunc_,
                // Add: let stepNumber = 0;
                t.variableDeclaration('let', [
                    t.variableDeclarator(t.identifier('stepNumber'), t.numericLiteral(0))
                ]),
                assignFn_ // Assign the function
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
      // Be careful with these, rely on the parent marker or specific checks
      // 'VariableDeclaration', // Allow for potential instrumentation *after* declaration
      // 'ExpressionStatement', // Allow for instrumentation *after* expression
    ]);

    // Helper to create the recorder call expression statement
    function createRecorderStatement(path, state, lineOverride = null, varNamesOverride = null) {
        // Should instrumentation be skipped for this context?
        if (path.node?._is_recorder_call || path.findParent(p => p.node?._generated_by_babel_plugin_time_travel_stub || p.node?._generated_by_plugin_)) {
            return null; // Skip instrumentation
        }

        // Ensure path.node exists and has loc
        if (!path?.node?.loc) {
             // console.warn(`[timeTravelPlugin] Skipping instrumentation: Node or location missing.`); // Optional warning
             return null;
        }

        const line = lineOverride ?? path.node.loc.start.line;
        const file = state.file.opts.filename || 'unknown';
        const suiteName = sanitizeForPath(state.opts?.suiteName || 'DefaultSuite');
        const maxVars = state.opts?.maxVars ?? DEFAULT_MAX_VARS;

        if (maxVars <= 0) return null; // No variables to capture

        let allNames;
        if (varNamesOverride) {
            allNames = varNamesOverride;
        } else {
            // Collect bindings and referenced identifiers for standard statements
            const bindingMap = path.scope?.getAllBindings?.() ?? {};
            allNames = new Set(Object.keys(bindingMap));
            try {
                // Only traverse if path.traverse exists and is a function
                if (typeof path.traverse === 'function') {
                    path.traverse({
                        Identifier(idPath) {
                            // Don't traverse into nested scopes defined within this statement
                            if (idPath.scope.parent !== path.scope && idPath.scope !== path.scope) {
                                idPath.skip();
                                return;
                            }
                            const { node, parent } = idPath;
                            const name = node.name;
                            if ( allNames.has(name) || name === 'undefined') return;
                            if (!idPath.isReferencedIdentifier()) return;
                            if (
                                ((t.isMemberExpression(parent) || t.isOptionalMemberExpression(parent)) && parent.property === node && !parent.computed) ||
                                ((t.isObjectProperty(parent) || t.isClassProperty(parent) || t.isObjectMethod(parent) || t.isClassMethod(parent)) && parent.key === node && !parent.computed) ||
                                (t.isLabeledStatement(parent) && parent.label === node) ||
                                (t.isBreakStatement(parent) && parent.label === node) ||
                                (t.isContinueStatement(parent) && parent.label === node)
                            ) { return; }
                            allNames.add(name);
                        },
                    });
                } else {
                    // console.warn(`[timeTravelPlugin] path.traverse not available for node type ${path.node.type} at ${file}:${line}. Variable collection might be incomplete.`);
                }
            } catch (traversalError) {
                 console.error(`[timeTravelPlugin] Error traversing identifiers for ${file}:${line}:`, traversalError);
                 return null; // Prevent proceeding with potentially incorrect vars
            }
        }

        const varsObjectAst = buildVarsObjectAst(allNames, maxVars);

        // *** MODIFIED CHECK ***
        // Ensure varsObjectAst is not just any node, but specifically an Expression,
        // as it needs to be an argument to t.callExpression.
        if (!varsObjectAst || !t.isExpression(varsObjectAst)) {
            console.error(`[timeTravelPlugin] Failed to build a valid vars object *expression* for ${file}:${line}. Got:`, varsObjectAst);
            return null; // Return null if it's not a valid expression
        }

        let recorderCall;
        try {
            // Call __recordStep(file, line, varsObj, suiteName, testName)
            recorderCall = t.callExpression(
                t.identifier('__recordStep'),
                [
                    t.stringLiteral(file),
                    t.numericLiteral(line),
                    varsObjectAst, // Now we're more confident this is a valid Expression
                    t.stringLiteral(suiteName),
                    t.logicalExpression( // globalThis.__testName ?? 'UnknownTest'
                        '??',
                        t.memberExpression(t.identifier('globalThis'), t.identifier('__testName')),
                        t.stringLiteral('UnknownTest')
                    )
                ]
            );
        } catch (callExprError) {
            // Catch errors during t.callExpression creation itself
            console.error(`[timeTravelPlugin] Error creating recorder CallExpression for ${file}:${line}:`, callExprError);
            return null;
        }

        // If recorderCall is somehow still not valid (highly unlikely now), prevent the error
        if (!recorderCall || !t.isExpression(recorderCall)) {
             console.error(`[timeTravelPlugin] Internal error: recorderCall is not a valid expression for ${file}:${line}.`);
             return null;
        }

        // This line should now be safe
        const recorderStatement = t.expressionStatement(recorderCall);
        recorderStatement._is_recorder_call = true; // Mark the statement itself
        return recorderStatement;
    }


    /* -------------------------------------------------- *
     * Plugin visitor                                     *
     * -------------------------------------------------- */
    return {
        name: 'time-travel-instrumentation-fs',
        visitor: {
            Program: {
                enter(path, state) {
                    // --- Stub injection logic ---
                    let alreadyInjected = false;
                    path.get('body').forEach(statementPath => {
                        if (statementPath.isIfStatement() && statementPath.node?._generated_by_babel_plugin_time_travel_stub) {
                            alreadyInjected = true;
                        } else if (statementPath.isIfStatement()) { // Fallback check
                            const test = statementPath.get('test');
                            if (test.isUnaryExpression({ operator: '!' })) {
                                const argument = test.get('argument');
                                if (argument.isMemberExpression() &&
                                    argument.get('object').isIdentifier({ name: 'globalThis' }) &&
                                    argument.get('property').isIdentifier({ name: '__recordStep' }))
                                { alreadyInjected = true; }
                            }
                        }
                    });

                    if (!alreadyInjected) {
                        try {
                           const stubNodes = createRuntimeStubAst();
                           if (Array.isArray(stubNodes) && stubNodes.length > 0 && stubNodes[0]) {
                                path.unshiftContainer('body', stubNodes);
                           } else {
                               console.error("[timeTravelPlugin] Internal error: createRuntimeStubAst did not return a valid node array.");
                           }
                        } catch (stubError) {
                             console.error("[timeTravelPlugin] Error creating or injecting runtime stub:", stubError);
                        }
                    }

                    // --- Initialize __testName ---
                     try {
                        const initTestNameAssignment = t.assignmentExpression(
                                '=',
                                t.memberExpression(t.identifier('globalThis'), t.identifier('__testName')),
                                t.logicalExpression( // globalThis.__testName = globalThis.__testName ?? 'NoTestContext'
                                    '??',
                                    t.memberExpression(t.identifier('globalThis'), t.identifier('__testName')),
                                    t.stringLiteral('NoTestContext')
                                )
                            );
                        // Check if the expression statement already exists at the top to prevent duplicates
                        const firstNode = path.node.body[0];
                        let shouldInjectInit = true;
                        // Check if the first node is the `if(!globalThis.__recordStep)` stub block
                        if (firstNode && firstNode._generated_by_babel_plugin_time_travel_stub) {
                            // If stub exists, check the node *after* the stub
                            const secondNode = path.node.body[1];
                            if (secondNode && t.isExpressionStatement(secondNode) && secondNode._generated_by_plugin_) {
                                shouldInjectInit = false; // Assume it's our initializer
                            }
                        } else if (firstNode && t.isExpressionStatement(firstNode) && firstNode._generated_by_plugin_) {
                            // If no stub, check the first node directly
                             shouldInjectInit = false;
                        }


                        if (shouldInjectInit) {
                           const initTestNameStmt = t.expressionStatement(initTestNameAssignment);
                           initTestNameStmt._generated_by_plugin_ = true; // Mark as generated
                           // Inject *after* the runtime stub if it exists, otherwise at the top
                           if (!alreadyInjected) { // If stub was just injected or already existed
                                path.insertAfter(initTestNameStmt); // Insert after the stub
                           } else {
                               path.unshiftContainer('body', initTestNameStmt); // Insert at the very top if no stub
                           }
                        }

                    } catch (initError) {
                        console.error("[timeTravelPlugin] Error creating or injecting __testName initializer:", initError);
                    }
                },
            },

            // Visitor for instrumenting *after* executable statements
            Statement: {
                enter(path, state) {
                    // Skip conditions checked within createRecorderStatement now

                    // Skip nodes specifically handled by the Function visitor or structure nodes
                    if (t.isFunctionDeclaration(path.node) || t.isClassDeclaration(path.node) ||
                        STATEMENTS_TO_SKIP.has(path.node.type)) {
                        return;
                    }

                    // Skip ExpressionStatements containing only function/class definitions
                    if (t.isExpressionStatement(path.node) &&
                        (t.isFunctionExpression(path.node.expression) ||
                         t.isArrowFunctionExpression(path.node.expression) ||
                         t.isClassExpression(path.node.expression))) {
                      return;
                    }

                    // Build the recorder call statement using the helper
                    const recorderStatement = createRecorderStatement(path, state);
                    if (!recorderStatement) return; // Skip if helper decided not to instrument

                    /* Insert AFTER current statement */
                    if (path.isStatement() && path.node.loc && (path.parentPath.isBlockStatement() || path.parentPath.isProgram())) {
                        try {
                            // Check if the *next* sibling is already a recorder call. Avoid double insertion.
                            const nextSibling = path.getSibling(path.key + 1);
                            if (!nextSibling.node || !nextSibling.node._is_recorder_call) {
                                path.insertAfter(recorderStatement);
                            }
                        } catch (e) {
                            const file = state.file.opts.filename || 'unknown';
                            const line = path.node.loc?.start?.line || '?';
                            console.error(`[timeTravelPlugin] Error inserting recorder call after ${file}:${line}: ${e.message}`);
                        }
                    } else {
                        // Attempt to wrap if not in a block (e.g., single statement in if/loop)
                        if (path.isStatement() && !path.isBlockStatement() && (path.parentPath.isIfStatement() || path.parentPath.isLoop() || path.parentPath.isWithStatement())) {
                            if (!t.isBlockStatement(path.node)) { // Avoid wrapping an already-wrapped block
                                try {
                                    const block = t.blockStatement([path.node, recorderStatement]);
                                    path.replaceWith(block);
                                } catch (e) {
                                    const file = state.file.opts.filename || 'unknown';
                                    const line = path.node.loc?.start?.line || '?';
                                    console.error(`[timeTravelPlugin] Error wrapping statement in block for ${file}:${line}: ${e.message}`);
                                }
                            }
                            // If it's already a block (e.g., due to Function visitor), the first `if` condition above handles insertion.
                        }
                    }
                },
            },

            // Visitor for instrumenting Function Entry
            Function(path, state) {
                try { // Wrap function visitor logic in try/catch
                    // Skip functions generated by this plugin
                    if (path.node._generated_by_plugin_ || path.findParent(p => p.node?._generated_by_babel_plugin_time_travel_stub || p.node?._generated_by_plugin_)) {
                        return;
                    }
                    // Skip getter/setter methods potentially created by buildVarsObjectAst
                    if (path.isObjectMethod() && (path.node.kind === 'get' || path.node.kind === 'set')) {
                        const parentObject = path.parentPath;
                        const grandParentObject = parentObject?.parentPath;
                        if (parentObject?.isObjectProperty() && grandParentObject?.isObjectExpression()) {
                            // Likely one of our generated getters/setters, check if grandparent is argument to __recordStep? Could be complex.
                            // Let's rely on the _generated_by_plugin_ check for now, assuming buildVarsObjectAst doesn't add it.
                            // If issues persist, add marker in buildVarsObjectAst.
                        }
                    }

                    // Skip functions without a body or location
                    if (!path.node.body || !path.node.loc) {
                        return;
                    }

                    // --- Ensure body is a BlockStatement ---
                    let bodyPath = path.get('body');
                    if (!bodyPath.isBlockStatement()) {
                        const node = path.node;
                        // Handle implicit return for arrow functions
                        if (t.isExpression(node.body)) {
                           bodyPath.replaceWith(t.blockStatement([t.returnStatement(node.body)]));
                           bodyPath = path.get('body'); // Re-fetch path after replacement
                        } else {
                             // If body is not an expression and not a block, something is wrong.
                             console.error(`[timeTravelPlugin] Function body is neither BlockStatement nor Expression at ${state.file.opts.filename || 'unknown'}:${path.node.loc.start.line}. Skipping entry instrumentation.`);
                             return;
                        }
                    }

                    // --- Create the recorder call for function entry ---
                    const varNames = new Set(Object.keys(path.scope?.getAllBindings?.() ?? {}));
                    if (!path.isArrowFunctionExpression()) {
                        varNames.add('arguments');
                    }
                    // Consider adding 'this' if needed, carefully. For now, omitted.

                    const functionStartLine = path.node.loc.start.line;
                    const recorderStatement = createRecorderStatement(path, state, functionStartLine, varNames);

                    if (!recorderStatement) return; // Skip if helper decided not to instrument

                    // --- Insert recorder call at the beginning of the body ---
                    // Check if the first statement is *already* our recorder call
                    const firstStmt = bodyPath.get('body.0');
                    if (!firstStmt?.node?._is_recorder_call) {
                         bodyPath.unshiftContainer('body', recorderStatement);
                    }
                } catch (e) {
                    const file = state.file.opts.filename || 'unknown';
                    const line = path.node?.loc?.start?.line || '?';
                    console.error(`[timeTravelPlugin] Error processing Function visitor near ${file}:${line}: ${e.message}`, e);
                }
            },

            // Visitor for setting test name from 'it'/'test' calls
            CallExpression(path, state) {
                try { // Wrap call expression visitor logic
                    const callee = path.get('callee');
                    if (callee.isIdentifier({ name: 'it' }) || callee.isIdentifier({ name: 'test' })) {
                        const args = path.get('arguments');
                        if (args.length > 0 && args[0].isStringLiteral()) {
                            const testName = args[0].node.value;
                            const testFunctionPath = args[args.length - 1];

                            if (testFunctionPath && (testFunctionPath.isFunctionExpression() || testFunctionPath.isArrowFunctionExpression())) {
                                // Check if function path has a valid body property
                                if (!testFunctionPath.node.body) return;

                                const assignmentAst = t.expressionStatement(
                                    t.assignmentExpression(
                                        '=',
                                        t.memberExpression(t.identifier('globalThis'), t.identifier('__testName')),
                                        t.stringLiteral(testName)
                                    )
                                );
                                assignmentAst._generated_by_plugin_ = true;

                                const bodyPath = testFunctionPath.get('body');
                                if (bodyPath.isBlockStatement()) {
                                    const firstStmt = bodyPath.get('body.0');
                                    if (!firstStmt?.node?._generated_by_plugin_) { // Check marker
                                        bodyPath.unshiftContainer('body', assignmentAst);
                                    }
                                } else if (t.isExpression(testFunctionPath.node.body)) { // Handle implicit return
                                    const currentBody = testFunctionPath.node.body;
                                    const newBody = t.blockStatement([
                                        assignmentAst,
                                        t.returnStatement(currentBody)
                                    ]);
                                    testFunctionPath.node.body = newBody; // Replace the body node directly
                                }
                            }
                        }
                    }
                } catch (e) {
                     const file = state.file.opts.filename || 'unknown';
                     const line = path.node?.loc?.start?.line || '?';
                     console.error(`[timeTravelPlugin] Error processing CallExpression visitor near ${file}:${line}: ${e.message}`, e);
                }
            },
        },
    };
}