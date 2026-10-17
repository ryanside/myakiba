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

const runtimeOwner = (context, identifier) => {
  for (let scope = context.sourceCode.getScope(identifier); scope; scope = scope.upper) {
    const [definition] = scope.set.get(identifier.name)?.defs ?? [];
    if (!definition) continue;
    const isModuleImport =
      definition.type === "ImportBinding" &&
      definition.node.type !== "ImportSpecifier" &&
      ENV_MODULES.has(definition.parent.source.value);
    return isModuleImport ? identifier.name : null;
  }
  return ENV_OWNERS.has(identifier.name) ? identifier.name : null;
};

const envOwner = (context, node) => {
  if (node.type === "Identifier") return runtimeOwner(context, node);
  if (node.type === "MetaProperty" && node.meta.name === "import" && node.property.name === "meta")
    return "import.meta";
  if (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.object.type === "Identifier" &&
    node.object.name === "globalThis" &&
    node.property.type === "Identifier" &&
    ENV_OWNERS.has(node.property.name)
  )
    return `globalThis.${node.property.name}`;
  return null;
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

const isLiteral = (node, value) => node?.type === "Literal" && node.value === value;
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
        const inner = callee.object;
        if (
          inner.type !== "CallExpression" ||
          inner.callee.type !== "MemberExpression" ||
          memberName(inner.callee) !== "toISOString"
        )
          return;
        const method = memberName(callee);
        const trims =
          ISO_TRIMS.has(method) || (method === "split" && isLiteral(node.arguments[0], "T"));
        if (!trims) return;
        context.report({
          node,
          message:
            'Trimming `.toISOString()` gives the UTC date or time, not the local one. Use toDateOnlyString from "@myakiba/utils/date-only".',
        });
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
  },
};
