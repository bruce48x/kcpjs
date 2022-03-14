module.exports = {
    parser: '@typescript-eslint/parser', //定义ESLint的解析器
    extends: ['plugin:@typescript-eslint/recommended'],//定义文件继承的子规范
    plugins: ['@typescript-eslint'],//定义了该eslint文件所依赖的插件
    env: {                          //指定代码的运行环境
        browser: true,
        node: true,
    },
    rules: {
        '@typescript-eslint/no-empty-function': ['error', { allow: ['constructors'] }],
        '@typescript-eslint/no-unused-vars': ['off'],
        '@typescript-eslint/explicit-function-return-type': ['off'],
        '@typescript-eslint/no-explicit-any': ['off'],
        '@typescript-eslint/explicit-module-boundary-types': ['off'],
    }
}