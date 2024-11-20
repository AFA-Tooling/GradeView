// babel.config.js
module.exports = {
    presets: [
      '@babel/preset-env',  // Transpile modern JS to older versions based on target environment
    ],
    plugins: [
      '@babel/plugin-transform-modules-commonjs',  // Convert ESM (import/export) to CJS (require/module.exports)
    ],
  };