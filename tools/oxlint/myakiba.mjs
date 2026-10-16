const DIRECTIVE = /^\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?(?:\s(?<rest>.*))?$/su;
const EXCEPTION =
  /^\S.*?\s--\s+\S.*?\s\(until (?<until>\d{4}-\d{2}-\d{2}), approved by [^\s()<>][^()<>]*\)\s*$/su;
const EXCEPTION_FORM =
  "`// oxlint-disable-next-line <rule> -- <why this line is safe> (until YYYY-MM-DD, approved by <name>)`";
const ISO_SLICE_METHODS = new Set(["slice", "substring", "substr", "split"]);

const localToday = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
          if (!exception) {
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

const noEnvOutsideEnvPackage = {
  meta: { type: "problem" },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.computed || node.property.type !== "Identifier" || node.property.name !== "env")
          return;
        const { object } = node;
        const isRuntimeEnv = object.type === "Identifier" && ENV_OWNERS.has(object.name);
        const isImportMetaEnv =
          object.type === "MetaProperty" &&
          object.meta.name === "import" &&
          object.property.name === "meta";
        if (!isRuntimeEnv && !isImportMetaEnv) return;
        context.report({
          node,
          message: `\`${isRuntimeEnv ? object.name : "import.meta"}.env\` read outside packages/env. Add the variable to the schema in packages/env and import \`env\` from "@myakiba/env/server" (or "/web", "/worker").`,
        });
      },
    };
  },
};

const noIsoSlice = {
  meta: { type: "problem" },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return;
        if (!ISO_SLICE_METHODS.has(callee.property.name)) return;
        const inner = callee.object;
        if (
          inner.type !== "CallExpression" ||
          inner.callee.type !== "MemberExpression" ||
          inner.callee.property.type !== "Identifier" ||
          inner.callee.property.name !== "toISOString"
        )
          return;
        context.report({
          node,
          message:
            '`.toISOString().slice()` gives the UTC day, not the local one. Use toDateOnlyString from "@myakiba/utils/date-only".',
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
