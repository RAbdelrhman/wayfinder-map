import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const files = ['src/**/*.{js,mjs,cjs,ts,mts,cts}', 'scripts/**/*.{js,mjs,cjs,ts,mts,cts}'];
const sinkMessage = 'Route HTML injection through src/ui/trustedHtml.ts using setTrustedHtml or insertTrustedHtml.';

export default defineConfig([
  {
    files,
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.{ts,mts,cts}', 'scripts/**/*.{ts,mts,cts}'],
    extends: [tseslint.configs.recommended],
    rules: {
      // Existing test doubles keep signature arguments; rest destructuring omits fields.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    files: ['src/ui/**/*.{js,ts}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files,
    ignores: ['src/ui/trustedHtml.ts'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: 'AssignmentExpression > MemberExpression.left[computed=false][property.name=/^(innerHTML|outerHTML)$/]',
          message: sinkMessage,
        },
        {
          selector: 'AssignmentExpression > MemberExpression.left[computed=true][property.value=/^(innerHTML|outerHTML)$/]',
          message: sinkMessage,
        },
        {
          selector: 'AssignmentExpression > MemberExpression.left[computed=true] > TemplateLiteral.property[expressions.length=0] > TemplateElement[value.cooked=/^(innerHTML|outerHTML)$/]',
          message: sinkMessage,
        },
        {
          selector: 'MemberExpression[computed=false][property.name="insertAdjacentHTML"], MemberExpression[computed=true][property.value="insertAdjacentHTML"]',
          message: sinkMessage,
        },
        {
          selector: 'MemberExpression[computed=true] > TemplateLiteral.property[expressions.length=0] > TemplateElement[value.cooked="insertAdjacentHTML"]',
          message: sinkMessage,
        },
        {
          selector: 'MemberExpression[computed=false][object.name="document"][property.name="write"], MemberExpression[computed=true][object.name="document"][property.value="write"], MemberExpression[computed=false][object.property.name="document"][property.name="write"], MemberExpression[computed=true][object.property.name="document"][property.value="write"]',
          message: sinkMessage,
        },
        {
          selector: 'MemberExpression[computed=true]:matches([object.name="document"], [object.property.name="document"]) > TemplateLiteral.property[expressions.length=0] > TemplateElement[value.cooked="write"]',
          message: sinkMessage,
        },
      ],
    },
  },
]);
