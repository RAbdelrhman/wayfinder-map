import js from '@eslint/js';
import { getPropertyName } from '@eslint-community/eslint-utils';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const files = ['src/**/*.{js,mjs,cjs,ts,mts,cts}', 'scripts/**/*.{js,mjs,cjs,ts,mts,cts}'];
const sinkMessage = 'Route HTML injection through src/ui/trustedHtml.ts using setTrustedHtml or insertTrustedHtml.';

const computedSinkRule = {
  meta: { type: 'problem', schema: [], messages: { sink: sinkMessage } },
  create(context) {
    return {
      MemberExpression(node) {
        const scope = context.sourceCode.getScope(node);
        const key = getPropertyName(node, scope);
        const assignment = node.parent.type === 'AssignmentExpression' && node.parent.left === node
          && (key === 'innerHTML' || key === 'outerHTML');
        const insertion = key === 'insertAdjacentHTML';
        const documentObject = (node.object.type === 'Identifier' && node.object.name === 'document')
          || (node.object.type === 'MemberExpression' && getPropertyName(node.object, scope) === 'document');
        const documentWrite = key === 'write' && documentObject;
        // The syntax restrictions already cover dotted and literal HTML property keys.
        const computedExpression = node.computed && node.property.type !== 'Literal';
        if (((assignment || insertion) && computedExpression) || documentWrite) {
          context.report({ node, messageId: 'sink' });
        }
      },
    };
  },
};

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
    plugins: { 'html-sinks': { rules: { 'no-computed-injection': computedSinkRule } } },
    rules: {
      'html-sinks/no-computed-injection': 'error',
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
          selector: 'MemberExpression[computed=false][property.name="insertAdjacentHTML"], MemberExpression[computed=true][property.value="insertAdjacentHTML"]',
          message: sinkMessage,
        },
      ],
    },
  },
]);
