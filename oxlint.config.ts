import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";

const dbClientBan = {
  name: "@myakiba/db/client",
  message: "Read and write through scope.tx in module.ts. The kernel opens the transaction.",
};
const dbSourcePath = {
  regex: "^(?:[./]|file:)(?:.*/)?db/(?:.*/)?src(?:/|$)|^@myakiba/db/src(?:/|$)",
  message:
    "Import @myakiba/db through its package exports, not by path. The kernel owns the client.",
};
const dbClientInPackage = {
  regex: "^\\.{1,2}/(?:.*/)?client(?:\\.[cm]?[jt]sx?)?$",
  allowTypeImports: true,
  message: "Only the kernel reads the client. Inside @myakiba/db, import it as a type only.",
};
const testImports = [
  { regex: "(?:^|/)[^/]+\\.test(?:\\.[cm]?[jt]sx?)?$", message: "Only tests import test files." },
  { regex: "^(?:[./]|@/|file:)(?:.*/)?test(?:/|$)", message: "Only tests import test files." },
];
const routeMatcherBans = [
  {
    name: "@myakiba/utils/result",
    importNames: ["tryCatch"],
    message: "Return fail(category, message) from the operation. serve() answers it.",
  },
  {
    name: "elysia",
    importNames: ["status"],
    message: "Return fail(category, message) from the operation. serve() answers it.",
  },
  {
    name: "@/domain/kernel",
    importNames: ["run"],
    message: "Routes call serve(ctx, Orders.op, input). run() is for kernel tests.",
  },
];
const dbClientOwners = ["apps/server/src/domain/kernel.ts", "packages/auth/src/server.ts"];
const testCode = ["**/*.test.ts", "**/*.test.tsx", "**/test/**"];
// Tests create and read rows directly.
const serverTests = ["apps/server/**/*.test.ts", "apps/server/test/**"];
// scraper code, replaced by the browser extension
const scraperCode = [
  "apps/worker/**",
  "apps/server/src/routers/sync/**",
  "apps/server/src/routers/data-transfer/**",
  "apps/server/src/routers/item/resync-service.ts",
];

const otherTypeAwareRules = [
  "typescript/await-thenable",
  "typescript/consistent-return",
  "typescript/consistent-type-exports",
  "typescript/dot-notation",
  "typescript/no-array-delete",
  "typescript/no-base-to-string",
  "typescript/no-confusing-void-expression",
  "typescript/no-deprecated",
  "typescript/no-duplicate-type-constituents",
  "typescript/no-for-in-array",
  "typescript/no-implied-eval",
  "typescript/no-meaningless-void-operator",
  "typescript/no-misused-promises",
  "typescript/no-misused-spread",
  "typescript/no-mixed-enums",
  "typescript/no-redundant-type-constituents",
  "typescript/no-unnecessary-boolean-literal-compare",
  "typescript/no-unnecessary-condition",
  "typescript/no-unnecessary-qualifier",
  "typescript/no-unnecessary-template-expression",
  "typescript/no-unnecessary-type-arguments",
  "typescript/no-unnecessary-type-assertion",
  "typescript/no-unnecessary-type-conversion",
  "typescript/no-unnecessary-type-parameters",
  "typescript/no-unsafe-argument",
  "typescript/no-unsafe-assignment",
  "typescript/no-unsafe-call",
  "typescript/no-unsafe-enum-comparison",
  "typescript/no-unsafe-member-access",
  "typescript/no-unsafe-return",
  "typescript/no-unsafe-type-assertion",
  "typescript/no-unsafe-unary-minus",
  "typescript/no-useless-default-assignment",
  "typescript/non-nullable-type-assertion-style",
  "typescript/only-throw-error",
  "typescript/prefer-find",
  "typescript/prefer-includes",
  "typescript/prefer-nullish-coalescing",
  "typescript/prefer-optional-chain",
  "typescript/prefer-promise-reject-errors",
  "typescript/prefer-readonly",
  "typescript/prefer-readonly-parameter-types",
  "typescript/prefer-reduce-type-parameter",
  "typescript/prefer-regexp-exec",
  "typescript/prefer-return-this-type",
  "typescript/prefer-string-starts-ends-with",
  "typescript/promise-function-async",
  "typescript/related-getter-setter-pairs",
  "typescript/require-array-sort-compare",
  "typescript/require-await",
  "typescript/restrict-plus-operands",
  "typescript/restrict-template-expressions",
  "typescript/return-await",
  "typescript/strict-boolean-expressions",
  "typescript/strict-void-return",
  "typescript/switch-exhaustiveness-check",
  "typescript/unbound-method",
  "typescript/use-unknown-in-catch-callback-variable",
];

export default defineConfig({
  extends: [core, react, antiSlop],
  ignorePatterns: ["**/*.gen.ts", "**/*.gen.tsx"],
  options: { typeAware: true },
  jsPlugins: [{ name: "myakiba", specifier: "./tools/oxlint/myakiba.mjs" }],
  rules: {
    ...Object.fromEntries(otherTypeAwareRules.map((rule) => [rule, "off"])),
    "typescript/no-floating-promises": "warn",
    "myakiba/require-suppression-reason": "warn",
    "myakiba/no-env-outside-env-package": "warn",
    "myakiba/no-iso-slice": "warn",
    "no-restricted-properties": [
      "warn",
      {
        object: "JSON",
        property: "parse",
        message:
          'Bare JSON.parse. Use parseJson(schema, text) from "@myakiba/utils/parse-json", which catches the SyntaxError and validates with the zod schema.',
      },
    ],
    "sort-keys": "off",
    curly: "off",
    "unicorn/switch-case-braces": "off",
    "no-negated-condition": "off",
    "unicorn/no-nested-ternary": "off",
    "arrow-body-style": "off",
    "no-plusplus": "off",
    "no-eq-null": "off",
    eqeqeq: ["error", "always", { null: "ignore" }],
    "default-case": "off",
    "class-methods-use-this": "off",
    "prefer-destructuring": "off",
    complexity: "off",
    "require-await": "off",
    "no-empty-function": "off",
    "unicorn/consistent-function-scoping": "off",
    "func-names": "off",
    "typescript/consistent-type-definitions": "off",
    "unicorn/no-array-for-each": "off",
    "unicorn/prefer-ternary": "off",
    "unicorn/no-array-reduce": "off",
    "promise/avoid-new": "off",
    "no-warning-comments": "off",
    "react/no-children-prop": "off",
    "react/function-component-definition": "off",
    "anti-slop/require-safety-comment-for-type-assertion": "off",
    "require-unicode-regexp": "off",
    "unicorn/prefer-number-coercion": "off",
    "prefer-named-capture-group": "off",
    "no-await-in-loop": "off",
    "react/todo": "off",
    "react/incompatible-library": "off",
    "react/rule-suppression": "off",
    "jsx-a11y/prefer-tag-over-role": "off",
    "func-style": "off",
    "no-inline-comments": "off",
    "no-use-before-define": "off",
  },
  overrides: [
    {
      files: ["packages/env/**", "scripts/**", "**/test/**", "**/*.test.ts", "**/*.test.tsx"],
      rules: { "myakiba/no-env-outside-env-package": "off" },
    },
    {
      files: ["packages/utils/src/parse-json.ts"],
      rules: { "no-restricted-properties": "off" },
    },
    {
      files: ["**"],
      excludeFiles: [...serverTests, ...scraperCode],
      rules: {
        "no-restricted-imports": [
          "error",
          { paths: [dbClientBan], patterns: [dbSourcePath, ...testImports] },
        ],
      },
    },
    {
      files: ["packages/db/**"],
      excludeFiles: ["packages/db/src/client.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          { paths: [dbClientBan], patterns: [dbSourcePath, dbClientInPackage, ...testImports] },
        ],
      },
    },
    {
      files: testCode,
      excludeFiles: [...serverTests, ...scraperCode],
      rules: {
        "no-restricted-imports": ["error", { paths: [dbClientBan], patterns: [dbSourcePath] }],
      },
    },
    {
      files: scraperCode,
      excludeFiles: testCode,
      rules: { "no-restricted-imports": ["error", { patterns: testImports }] },
    },
    {
      files: dbClientOwners,
      rules: {
        "no-restricted-imports": ["error", { patterns: [dbSourcePath, ...testImports] }],
        "myakiba/no-db-client-export": "error",
      },
    },
    {
      files: [
        "apps/web/src/components/wishlist/**",
        "apps/web/src/hooks/use-wishlist.ts",
        "apps/web/src/routes/(app)/wishlist.tsx",
        "apps/web/src/components/orders/**",
        "apps/web/src/components/collection/**",
        "apps/web/src/components/cells/popover-release-date-cell.tsx",
        "apps/web/src/hooks/use-orders.ts",
        "apps/web/src/hooks/use-collection.ts",
        "apps/web/src/routes/(app)/orders.tsx",
        "apps/web/src/routes/(app)/orders_.$id.tsx",
        "apps/web/src/routes/(app)/collection.tsx",
      ],
      excludeFiles: [
        // Scraper flow, replaced by the browser extension.
        "apps/web/src/components/orders/order-item-sync-sheet.tsx",
        // The order search, release and entry reads move with their families in W3.
        "apps/web/src/components/orders/unified-item-move-form.tsx",
        "apps/web/src/components/collection/collection-item-form.tsx",
        "apps/web/src/components/collection/filters-form.tsx",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@tanstack/react-query",
                importNames: [
                  "infiniteQueryOptions",
                  "queryOptions",
                  "useInfiniteQuery",
                  "useIsFetching",
                  "useIsMutating",
                  "useMutation",
                  "useMutationState",
                  "useQueries",
                  "useQuery",
                  "useQueryClient",
                  "useSuspenseInfiniteQuery",
                  "useSuspenseQueries",
                  "useSuspenseQuery",
                ],
                message:
                  "Read and write server data through a resource module in apps/web/src/data. Declare a new query family in apps/web/src/data/catalog.ts.",
              },
              dbClientBan,
            ],
            patterns: [dbSourcePath, ...testImports],
          },
        ],
      },
    },
    {
      files: ["apps/server/src/routers/*/module.ts"],
      rules: { "myakiba/no-window-total": "warn" },
    },
    {
      files: ["apps/server/src/routers/**"],
      excludeFiles: [...serverTests, ...scraperCode],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [dbClientBan, ...routeMatcherBans],
            patterns: [dbSourcePath, ...testImports],
          },
        ],
      },
    },
  ],
});
