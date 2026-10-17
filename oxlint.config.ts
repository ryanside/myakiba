import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react, antiSlop],
  ignorePatterns: ["**/*.gen.ts", "**/*.gen.tsx"],
  jsPlugins: [{ name: "myakiba", specifier: "./tools/oxlint/myakiba.mjs" }],
  rules: {
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
  ],
});
