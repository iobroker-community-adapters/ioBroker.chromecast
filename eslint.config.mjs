// ioBroker eslint template configuration file for js and ts files
// Please note that esm or react based modules need additional modules loaded.
import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        // specify files to exclude from linting here
        ignores: [
            '.dev-server/',
            '.vscode/',
            '*.test.js',
            'test/**/*.js',
            '*.config.mjs',
            'build/',
            'dist/',
            'admin/build/',
            'admin/words.js',
            'admin/admin.d.ts',
            'admin/blockly.js',
            '**/adapter-config.d.ts',
        ],
    },
    {
        // you may disable some 'jsdoc' warnings - but using jsdoc is highly recommended
        // as this improves maintainability. jsdoc warnings will not block build process.
        rules: {
            'jsdoc/require-jsdoc': 'warn',
            'jsdoc/require-param': 'warn',
            'jsdoc/require-param-description': 'warn',
            'jsdoc/require-returns-description': 'warn',
            'jsdoc/require-returns-check': 'warn',
        },
    },
    {
        // Additional rules for legacy code compatibility
        files: ['gulpfile.js'],
        rules: {
            'no-prototype-builtins': 'off',
            'prefer-template': 'off',
            'curly': 'off',
            'no-else-return': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'no-empty': 'off',
        },
    },
    {
        // Rules for widget files that run in browser context
        files: ['widgets/**/*.js'],
        rules: {
            'no-undef': 'off',
            'no-prototype-builtins': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'no-empty': 'off',
        },
    },
    {
        // Rules for lib and main files to allow legacy patterns
        files: ['lib/**/*.js', 'main.js'],
        rules: {
            'no-prototype-builtins': 'off',
            '@typescript-eslint/no-this-alias': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-constant-binary-expression': 'off',
            'valid-typeof': 'off',
            'no-useless-escape': 'off',
            'no-irregular-whitespace': 'off',
            'jsdoc/no-blank-blocks': 'off',
        },
    },
];
