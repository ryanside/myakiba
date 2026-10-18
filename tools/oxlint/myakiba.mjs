const DIRECTIVE = /^\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?(?:\s(?<rest>.*))?$/su;
const EXCEPTION =
  /^\S.*?\s--\s+\S.*?\s\(until (?<until>\d{4}-\d{2}-\d{2}), approved by [^\s()<>][^()<>]*\)\s*$/su;
const EXCEPTION_FORM =
  "`// oxlint-disable-next-line <rule> -- <why this line is safe> (until YYYY-MM-DD, approved by <name>)`";
const ISO_TRIMS = new Set(["slice", "substring", "substr"]);

const localToday = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const isRealDate = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const requireSuppressionReason = {
  meta: { type: "problem" },
  create(context) {
    const today = localToday();
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const directive = DIRECTIVE.exec(comment.value);
          if (!directive) continue;
          const exception = EXCEPTION.exec(directive.groups.rest ?? "");
          if (!exception || !isRealDate(exception.groups.until)) {
            context.report({
              loc: comment.loc,
              message: `Suppression without a rule, reason, expiry date and approver. Fix the code, or ask a human to approve an exception and write ${EXCEPTION_FORM}.`,
            });
          } else if (exception.groups.until < today) {
            context.report({
              loc: comment.loc,
              message: `Exception expired on ${exception.groups.until}. Fix the code, or ask a human to approve a new expiry date in ${EXCEPTION_FORM}.`,
            });
          }
        }
      },
    };
  },
};

const ENV_OWNERS = new Set(["process", "Bun"]);
const ENV_MODULES = new Set(["process", "node:process", "bun"]);

const isEnvKey = (key, computed) =>
  computed
    ? key.type === "Literal" && key.value === "env"
    : key.type === "Identifier" && key.name === "env";

const runtimeDefinition = (variable) =>
  variable?.isValueVariable
    ? variable.defs.find(
        ({ node, parent }) =>
          !node.declare &&
          !parent?.declare &&
          node.importKind !== "type" &&
          parent?.importKind !== "type",
      )
    : undefined;

const WRAPPERS = new Set([
  "ChainExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);
const unwrap = (node) => (WRAPPERS.has(node?.type) ? unwrap(node.expression) : node);

const aliasesRuntime = (context, { type, node, parent }, depth) => {
  if (type === "ImportBinding") {
    const imported =
      node.type === "ImportSpecifier" ? (node.imported.name ?? node.imported.value) : "default";
    return imported === "default" && ENV_MODULES.has(parent.source.value);
  }
  if (type !== "Variable" || node.id.type !== "Identifier" || !node.init || depth > 3) return false;
  const init = unwrap(node.init);
  if (
    init.type === "CallExpression" &&
    init.callee.type === "Identifier" &&
    init.callee.name === "require"
  )
    return ENV_MODULES.has(init.arguments[0]?.value);
  return envOwner(context, init, depth + 1) !== null;
};

const runtimeOwner = (context, identifier, depth) => {
  for (let scope = context.sourceCode.getScope(identifier); scope; scope = scope.upper) {
    const definition = runtimeDefinition(scope.set.get(identifier.name));
    if (definition) return aliasesRuntime(context, definition, depth) ? identifier.name : null;
  }
  return ENV_OWNERS.has(identifier.name) ? identifier.name : null;
};

const envOwner = (context, owner, depth = 0) => {
  const node = unwrap(owner);
  if (node.type === "Identifier") return runtimeOwner(context, node, depth);
  if (node.type === "MetaProperty" && node.meta.name === "import" && node.property.name === "meta")
    return "import.meta";
  if (node.type !== "MemberExpression") return null;
  const base = unwrap(node.object);
  const name = memberName(node);
  return base.type === "Identifier" && base.name === "globalThis" && ENV_OWNERS.has(name)
    ? `globalThis.${name}`
    : null;
};

const noEnvOutsideEnvPackage = {
  meta: { type: "problem" },
  create(context) {
    const report = (node, read) =>
      context.report({
        node,
        message: `\`${read}\` read outside packages/env. Add the variable to the schema in packages/env and import \`env\` from "@myakiba/env/server" (or "/web", "/worker").`,
      });
    return {
      MemberExpression(node) {
        const owner = isEnvKey(node.property, node.computed) && envOwner(context, node.object);
        if (owner) report(node, `${owner}.env`);
      },
      VariableDeclarator(node) {
        const owner = node.id.type === "ObjectPattern" && node.init && envOwner(context, node.init);
        if (
          owner &&
          node.id.properties.some(
            (property) => property.type === "Property" && isEnvKey(property.key, property.computed),
          )
        )
          report(node.id, `${owner}.env`);
      },
      ImportDeclaration(node) {
        if (!ENV_MODULES.has(node.source.value) || node.importKind === "type") return;
        for (const specifier of node.specifiers) {
          const imported =
            specifier.type === "ImportSpecifier" &&
            specifier.importKind !== "type" &&
            specifier.imported;
          if (imported && (imported.name ?? imported.value) === "env")
            report(specifier, `import { env } from "${node.source.value}"`);
        }
      },
    };
  },
};

const splitsAtT = (node) =>
  (node?.type === "Literal" && (node.value === "T" || node.regex?.pattern === "T")) ||
  (node?.type === "TemplateLiteral" &&
    node.expressions.length === 0 &&
    node.quasis[0]?.value.cooked === "T");
const memberName = ({ computed, property }) => {
  if (!computed) return property.type === "Identifier" ? property.name : null;
  if (property.type === "Literal") return String(property.value);
  if (property.type === "TemplateLiteral" && property.expressions.length === 0)
    return property.quasis[0]?.value.cooked ?? null;
  return null;
};

const noIsoSlice = {
  meta: { type: "problem" },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== "MemberExpression") return;
        const inner = unwrap(callee.object);
        if (
          inner?.type !== "CallExpression" ||
          inner.callee.type !== "MemberExpression" ||
          memberName(inner.callee) !== "toISOString"
        )
          return;
        const method = memberName(callee);
        const trims = ISO_TRIMS.has(method) || (method === "split" && splitsAtT(node.arguments[0]));
        if (!trims) return;
        context.report({
          node,
          message:
            'Trimming `.toISOString()` gives the UTC date or time, not the local one. For a local calendar day use format(date, "yyyy-MM-dd") from date-fns. toDateOnlyString from "@myakiba/utils/date-only" reads UTC fields, so use it only to turn a date-only value back into YYYY-MM-DD.',
        });
      },
    };
  },
};

const WINDOW_OVER_ALL = /\bover\s*\(\s*\)/iu;

/** `COUNT(*) OVER ()` over a page reports 0 once the offset passes the end (5adf7f61). */
const noWindowTotal = {
  meta: { type: "problem" },
  create(context) {
    return {
      TaggedTemplateExpression(node) {
        if (node.tag.type !== "Identifier" || node.tag.name !== "sql") return;
        if (!node.quasi.quasis.some((quasi) => WINDOW_OVER_ALL.test(quasi.value.raw))) return;
        context.report({
          node,
          message:
            "Window total over the page. A total must count the filtered set, so it survives an offset past the end.",
        });
      },
    };
  },
};

const DB_CLIENT = "@myakiba/db/client";

const CALLS = new Set(["CallExpression", "NewExpression"]);
const SKIP = new Set(["parent", "type", "range", "loc", "start", "end"]);

/** Reports where an exported declaration hands the client out: a property, a return, an arrow body. */
const handOuts = (root, isClient, report) => {
  const visit = (node, parent, grandparent) => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent, grandparent);
      return;
    }
    if (!node?.type) return;
    const callArgument = CALLS.has(grandparent?.type) && grandparent.arguments.includes(parent);
    if (node.type === "Property" && isClient(node.value) && !callArgument) report(node);
    if (node.type === "PropertyDefinition" && isClient(node.value)) report(node);
    if (node.type === "ReturnStatement" && isClient(node.argument)) report(node);
    if (node.type === "ArrowFunctionExpression" && node.expression && isClient(node.body))
      report(node);
    for (const key of Object.keys(node)) if (!SKIP.has(key)) visit(node[key], node, parent);
  };
  visit(root);
};

/** The client's owners use it. Exporting it, under any name, hands it to every importer. */
const noDbClientExport = {
  meta: { type: "problem" },
  create(context) {
    const report = (node) =>
      context.report({
        node,
        message: `Do not export ${DB_CLIENT}. Export an operation or a helper that uses it.`,
      });
    return {
      Program(program) {
        const client = new Set();
        const declarators = [];
        for (const statement of program.body) {
          if (statement.type === "ImportDeclaration" && statement.source.value === DB_CLIENT)
            for (const specifier of statement.specifiers) client.add(specifier.local.name);
          const declaration =
            statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
          if (declaration?.type === "VariableDeclaration")
            declarators.push(...declaration.declarations);
        }
        for (let grew = true; grew;) {
          grew = false;
          for (const { id, init } of declarators) {
            const value = unwrap(init);
            if (id.type !== "Identifier" || client.has(id.name)) continue;
            if (value?.type === "Identifier" && client.has(value.name)) {
              client.add(id.name);
              grew = true;
            }
          }
        }
        const isClient = (node) => {
          const value = unwrap(node);
          return value?.type === "Identifier" && client.has(value.name);
        };
        const exported = new Set();
        for (const statement of program.body)
          if (statement.type === "ExportNamedDeclaration" && !statement.source)
            for (const specifier of statement.specifiers) exported.add(specifier.local.name);
          else if (statement.type === "ExportDefaultDeclaration")
            exported.add(statement.declaration.name);
        for (const statement of program.body) {
          if (
            statement.type === "ExportNamedDeclaration" ||
            statement.type === "ExportDefaultDeclaration"
          )
            handOuts(statement.declaration, isClient, report);
          if (statement.type === "FunctionDeclaration" || statement.type === "ClassDeclaration") {
            if (exported.has(statement.id?.name)) handOuts(statement, isClient, report);
          } else if (statement.type === "VariableDeclaration")
            for (const declarator of statement.declarations)
              if (exported.has(declarator.id.name)) handOuts(declarator, isClient, report);
          if (statement.type === "ExportAllDeclaration" && statement.source.value === DB_CLIENT)
            report(statement);
          if (statement.type === "ExportDefaultDeclaration" && isClient(statement.declaration))
            report(statement);
          if (statement.type !== "ExportNamedDeclaration") continue;
          if (statement.source?.value === DB_CLIENT) report(statement);
          else if (!statement.source)
            for (const specifier of statement.specifiers)
              if (isClient(specifier.local)) report(specifier);
          if (statement.declaration?.type === "VariableDeclaration")
            for (const { init } of statement.declaration.declarations)
              if (isClient(init)) report(statement);
        }
      },
    };
  },
};

export default {
  meta: { name: "myakiba" },
  rules: {
    "require-suppression-reason": requireSuppressionReason,
    "no-env-outside-env-package": noEnvOutsideEnvPackage,
    "no-iso-slice": noIsoSlice,
    "no-window-total": noWindowTotal,
    "no-db-client-export": noDbClientExport,
  },
};
