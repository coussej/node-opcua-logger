const AJV = require('ajv')
const fs = require('fs-extra')
const path = require('path')
const toml = require('toml')

const loc = process.env.CONFIG_FILE || path.resolve(process.cwd(), 'config.toml')

let load = () => {
  let file = fs.readFileSync(loc)
  let text

  // parse the file as TOML if it has a .toml extension.
  if (path.extname(loc).toLowerCase() === '.toml') {
    text = toml.parse(file)
  } else {
    text = JSON.parse(file)
  }

  // validate the resulting JSON against the config schema
  let schema = require('./schema/configschema.json')
  let ajv = new AJV()

  if (!ajv.validate(schema, text)) {
    throw new Error(ajv.errors[0].dataPath + ': ' + ajv.errors[0].message)
  }

  return text
}

module.exports = { load }
