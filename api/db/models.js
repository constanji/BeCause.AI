const mongoose = require('mongoose');
const { createModels } = require('@because/data-schemas');
const models = createModels(mongoose);

module.exports = { ...models };
