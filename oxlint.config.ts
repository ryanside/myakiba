import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react],
  ignorePatterns: ["**/*.gen.ts", "**/*.gen.tsx"],
  rules: {
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
    "func-style": "off",
    "no-inline-comments": "off",
    "no-use-before-define": "off",
  },
});
