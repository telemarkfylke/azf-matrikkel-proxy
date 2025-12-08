const fs = require('fs')
const path = require('path')

/**
 * A class for getting request templates
 */
class TemplateClient {
  // getTemplate - Gets a template from the filesystem
  static getTemplate (filename) {
    if (!filename) {
      throw new Error('Template was not provided')
    }

    const fullFilePath = path.resolve(__dirname, 'templates/', filename)

    if (!fs.existsSync(fullFilePath)) {
      throw new Error('Template could not be found at location: ' + fullFilePath)
    }

    return fs.readFileSync(fullFilePath, {encoding: 'utf-8'})
  }

  // listTemplates - Lists all available templates
  static listTemplates () {
    const templateDirectoryPath = path.resolve(__dirname, 'templates/')

    if (!fs.existsSync(templateDirectoryPath)) {
      throw new Error('Template directory could not be found: ' + templateDirectoryPath)
    }

    return fs.readdirSync(templateDirectoryPath)
  }
}

module.exports = TemplateClient
