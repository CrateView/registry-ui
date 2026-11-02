import withNuxt from './.nuxt/eslint.config.mjs';

const importSpacing = [
  'error',
  { blankLine: 'always', prev: 'import', next: '*' },
  { blankLine: 'any', prev: 'import', next: 'import' },
];

export default withNuxt(
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/html-self-closing': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}', '**/*.vue'],
    rules: { 'padding-line-between-statements': importSpacing },
  },
  {
    files: ['**/*.vue'],
    rules: {
      'vue/block-order': ['error', { order: ['template', 'script', 'style'] }],
      'vue/attributes-order': [
        'error',
        {
          order: [
            'DEFINITION',
            'LIST_RENDERING',
            'CONDITIONALS',
            'RENDER_MODIFIERS',
            'UNIQUE',
            'TWO_WAY_BINDING',
            'OTHER_DIRECTIVES',
            'GLOBAL',
            'ATTR_STATIC',
            'ATTR_DYNAMIC',
            'EVENTS',
            'CONTENT',
          ],
          alphabetical: false,
        },
      ],
      'vue/html-indent': [
        'error',
        2,
        { attribute: 1, baseIndent: 1, closeBracket: 0, alignAttributesVertically: true, ignores: [] },
      ],
      'vue/multiline-html-element-content-newline': [
        'error',
        { ignoreWhenEmpty: true, ignores: ['span'], allowEmptyLines: false },
      ],
      'vue/padding-line-between-blocks': ['error', 'always'],
      'vue/singleline-html-element-content-newline': [
        'error',
        { ignoreWhenNoAttributes: false, ignoreWhenEmpty: true, ignores: ['span'] },
      ],
    },
  },
  { ignores: ['vendor/**', '.output/**', 'test-results/**', 'playwright-report/**', 'coverage/**'] },
);
