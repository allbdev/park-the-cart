import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

const NON_DETERMINISTIC_MATH = [
  "random",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "atan2",
  "exp",
  "expm1",
  "log",
  "log1p",
  "log2",
  "log10",
  "pow",
  "hypot",
  "cbrt",
  "sinh",
  "cosh",
  "tanh",
];

export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      "playwright-report",
      "test-results",
      "node_modules",
      "design-captures",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // The simulation must give bit-identical results in every browser (CLAUDE.md).
    files: ["src/core/**/*.ts"],
    ignores: ["src/core/math.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        ...NON_DETERMINISTIC_MATH.map((property) => ({
          object: "Math",
          property,
          message:
            "Not deterministic across engines (or random). Use src/core/math.ts or src/core/rng.ts.",
        })),
        { object: "Date", property: "now", message: "Time comes in as input in src/core." },
      ],
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "localStorage",
        "performance",
        "Date",
      ],
    },
  },
);
