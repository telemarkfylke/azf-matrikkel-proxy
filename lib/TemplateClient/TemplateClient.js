const fs = require("node:fs");
const path = require("node:path");

/**
 * Functions for listing and reading templates
 */

/**
 * Gets a template from the filesystem
 *
 * @param {string} filename - The name of the template file
 * @returns {string} The template content
 */
const getTemplate = (filename) => {
  if (!filename) {
    throw new Error("Template was not provided");
  }

  const fullFilePath = path.resolve(__dirname, "templates/", filename);

  if (!fs.existsSync(fullFilePath)) {
    throw new Error(`Template could not be found at location: ${fullFilePath}`);
  }

  return fs.readFileSync(fullFilePath, { encoding: "utf-8" });
};

/**
 * Lists all available templates
 *
 * @returns {string[]} - An array of template filenames
 */
const listTemplates = () => {
  const templateDirectoryPath = path.resolve(__dirname, "templates/");

  if (!fs.existsSync(templateDirectoryPath)) {
    throw new Error(`Template directory could not be found: ${templateDirectoryPath}`);
  }

  return fs.readdirSync(templateDirectoryPath);
};

module.exports = {
  getTemplate,
  listTemplates
};
