import config, { reactConfig } from '@iobroker/eslint-config';

export default [
    ...config,
    ...reactConfig,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['*.js', '*.mjs'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        ignores: ['build/', 'node_modules/', '.__mf__temp/', 'vite.config.*'],
    },
    {
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
        },
    },
];
