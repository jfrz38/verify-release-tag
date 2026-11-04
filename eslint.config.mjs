import eslint from "@eslint/js";
import cleanArchitecture from "@jfrz38/eslint-plugin-clean-architecture-highlighter";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["coverage/**", "dist/**", "node_modules/**"],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      "clean-architecture-highlighter": cleanArchitecture,
    },
    rules: {
      "clean-architecture-highlighter/no-layer-violation": [
        "error",
        {
          sourceFolder: "src",
          layers: {
            infrastructure: {
              aliases: ["infrastructure", "action"],
            },
          },
        },
      ],
    },
  },
);
