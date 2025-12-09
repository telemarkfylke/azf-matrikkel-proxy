const fs = require("node:fs");
const path = require("node:path");

const XmlReader = require("xml-reader");
const xmlQuery = require("xml-query");

/**
 * Functions for parsing and resolving wsdl and xsd-files to resolve class-names and data types.
 * The purpose of this is that the Matrikkel documentation can be hard to read or have missing information.
 * This client makes it possible to specify resolve=true in the requests.
 * This will make the API resolve any type information in the response.
 */

/**
 * @type {{name: string, data: string, parsed: XmlNode}[]}
 */
const loadedFiles = [];

/**
 * Get all namespaces and schema locations used in a xsd-file
 *
 * @param {XmlNode} parsedXML - The parsed XML content
 * @returns {{id: string, namespace: string}[]}
 */
const getNamespacesAndSchemaLocations = (parsedXML) => {
  if (!parsedXML) {
    return [];
  }

  // Find all namespaces
  const namespaces = [];
  const _namespaces = xmlQuery(parsedXML).find("xs:schema").attr();
  if (_namespaces) {
    for (const ns in _namespaces) {
      if (ns.startsWith("xmlns:")) {
        namespaces.push({
          id: ns.split(":")[1],
          namespace: _namespaces[ns]
        });
      }
    }
  }

  // Find all schema imports for the namespaces
  xmlQuery(parsedXML)
    .find("xs:import")
    .each((e) => {
      if (!(e.attributes?.namespace && e.attributes.schemaLocation)) {
        return;
      }

      namespaces.forEach((ns) => {
        if (ns.namespace === e.attributes.namespace) {
          ns.schemaLocation = e.attributes.schemaLocation;
        }
      });
    });

  return namespaces;
};

/**
 * Loads all files then caches them
 *
 * @param {boolean} force - Force reloading of all files
 */
const loadAllFiles = (force = false) => {
  // If the files is already loaded, just return them
  if (!force && loadedFiles.length > 0) {
    return;
  }
  // Iterate through all WSDL-files and load them into memory
  const files = listFiles();
  files.forEach((file) => {
    const f = readFile(file);
    loadedFiles.push({
      name: file,
      data: f,
      parsed: XmlReader.parseSync(f)
    });
  });
};

/**
 * Lists all available templates
 *
 * @param [options] - Optional options for listing files
 * @returns {string[]} - Array of filenames
 */
const listFiles = (options) => {
  if (loadedFiles.length > 0) {
    return loadedFiles.map((f) => f.name);
  }

  const directoryPath = path.resolve(__dirname, "wsdl/");
  if (!fs.existsSync(directoryPath)) {
    throw new Error(`Template directory could not be found: ${directoryPath}`);
  }

  let files = fs.readdirSync(directoryPath);

  if (options) {
    files = files.map((f) => {
      if (options.toLowerCase) {
        f = f.toLowerCase();
      }
      return f;
    });
  }

  return files;
};

/**
 * Returns a file from wsdl-folder
 *
 * @param {string} filename - The filename to read
 * @param [options] - Optional options for reading the file
 * @returns {any|string} - The file content or parsed XML content
 */
const readFile = (filename, options) => {
  const cached = loadedFiles.find((f) => f.name === filename);
  if (cached) {
    if (cached.parsed && options && options.parsed) {
      return cached.parsed;
    }
    if (cached.data) {
      return cached.data;
    }
  }

  const fullFilePath = path.resolve(__dirname, "wsdl/", filename);
  if (!fs.existsSync(fullFilePath)) {
    throw new Error(`The file "${fullFilePath}" could not be found`);
  }

  // Read and parse the file
  const data = fs.readFileSync(fullFilePath, "utf-8");
  const parsed = XmlReader.parseSync(data);

  // Push to the cache
  loadedFiles.push({
    name: filename,
    data,
    parsed
  });

  // Return the data
  if (options?.parsed) {
    return parsed;
  }

  return data;
};

/**
 * Returns the schema file matching the provided namespace
 *
 * @param {string} namespace - The target namespace to search for
 * @param {string} [extension] - Optional file extension to limit the search
 * @returns {string} - The found filename or empty string if not found
 */
const findSchemaForNamespace = (namespace, extension) => {
  // Input validation
  if (!namespace || !namespace.includes("/")) {
    return "";
  }

  // Variables
  let foundFile;

  // Get all schema files
  let files = listFiles();

  // Determine what files to start with
  const fileHint = namespace.substring(namespace.lastIndexOf("/") + 1);
  const firstSearchFiles = files.filter((f) => (!extension ? f.toLowerCase().startsWith(fileHint.toLowerCase()) : f.toLowerCase() === `${fileHint}.${extension}`));

  // Remove the search-first files form the rest of tile files
  files = files.filter((f) => !firstSearchFiles.includes(f));

  files = firstSearchFiles.concat(files);

  files.forEach(async (f) => {
    // Read the file
    const parsed = readFile(f, { parsed: true });
    // Attempt to find the
    const targetNamespace = xmlQuery(parsed).find("xs:schema").attr("targetNamespace");
    // Check if the file has the correct target namespace
    if (targetNamespace === namespace) {
      foundFile = f;
      return foundFile;
    }
  });
  return foundFile;
};

/**
 * Find xsi-type
 *
 * @param {string} namespace - The target namespace
 * @param {string} method - The method name
 * @param {string} itemType - The item type to find
 * @returns {string} - The xsi-type found
 */
/*const findXsiType = (namespace, method, itemType) => {
	// Input validation
	if (!namespace || !method) {
		return ""
	}

	// Attempt to find the correct schema
	const schema = findSchemaForNamespace(namespace)
	// Read the file
	const parsed = readFile(schema, { parsed: true })

	// Find all namespaces
	const namespaces = []
	const _namespaces = xmlQuery(parsed).find("xs:schema").attr()
	if (_namespaces) {
		for (const ns in _namespaces) {
			if (ns.startsWith("xmlns:")) {
				namespaces.push({
					id: ns.split(":")[1],
					namespace: _namespaces[ns]
				})
			}
		}
	}

	// Find all schema imports for the namespaces
	xmlQuery(parsed)
		.find("xs:import")
		.each((e) => {
			if (!(e.attributes?.namespace && e.attributes.schemaLocation)) {
				return
			}

			namespaces.forEach((ns) => {
				if (ns.namespace === e.attributes.namespace) {
					ns.schemaLocation = e.attributes.schemaLocation
				}
			})
		})

	// Find the definition
	let foundDefinition
	xmlQuery(parsed)
		.find("xs:complexType")
		.each((node) => {
			if (node.attributes.name === method) {
				foundDefinition = node
			}
		})

	// Search for the value
	let foundType
	xmlQuery(foundDefinition)
		.find("xs:element")
		.each((e) => {
			if (!e.attributes || !e.attributes.name || !e.attributes.type || !e.attributes.type.includes(":")) {
				return
			}

			if (e.name === itemType) {
				foundType = e.attributes.type
				return
			}

			const nsId = e.attributes.type.split(":")[0]
			const nextType = e.attributes.type.split(":")[1]
			const matchNs = namespaces.find((ns) => ns.id === nsId)

			// Load the file
			const subParsed = readFile(matchNs.schemaLocation, { parsed: true })
			// Find the new type
			xmlQuery(subParsed)
				.find("xs:complexType")
				.each((elm) => {
					if (elm.attributes.name !== nextType) {
						return
					}

					xmlQuery(elm)
						.find("xs:element")
						.each((subElement) => {
							if (!(subElement.attributes.name === itemType && subElement.attributes.type)) {
								return
							}

							if (subElement.attributes.type.includes(":")) {
								foundType = subElement.attributes.type.split(":")[1]
								return
							}

							foundType = subElement.attributes.type
						})
				})
		})

	return foundType
}*/

/**
 * Retrieves all XSI-types found in the provided XML
 *
 * @param {XmlNode} parsedXML - The parsed XML content
 * @returns {{type: string, namespace: string}[]} - Array of found xsi types
 */
const findAllXsiTypesInXml = (parsedXML) => {
  // Input validation
  if (!parsedXML) {
    return [];
  }

  // Variables
  const xsiTypes = []; // Array of typenames and namespaces

  // Find the body and responses
  const body = xmlQuery(parsedXML).find("Body");
  const responses = body.children();

  // Retrieve the response type and namespace
  responses.each((response) => {
    // Variables
    const namespaces = []; // Array that stores all namespaces present in this response

    // Get the namespaces
    if (response.attributes && typeof response.attributes === "object") {
      for (const attr in response.attributes) {
        if (attr.startsWith("xmlns:")) {
          namespaces.push({
            id: attr.split(":")[1],
            namespace: response.attributes[attr]
          });
        } else if (attr === "xmlns") {
          namespaces.push({
            id: "ns",
            namespace: response.attributes[attr]
          });
        }
      }
    }

    // Recursively search through the data for xsi types
    function searchForXSIType(element, typesArray = [], level = 0) {
      // If first level, register the type as a xsi-type
      if (level === 0 && element.name && element.name.includes(":")) {
        const typeName = element.name.split(":")[1];
        const typeNamespaceId = element.name.split(":")[0];

        let typeNamespace = namespaces.find((ns) => ns.id === typeNamespaceId);
        if (typeNamespace) {
          typeNamespace = typeNamespace.namespace;
        }

        // Add the xsi-type if it has not been already added
        if (typeNamespace) {
          const match = typesArray.find((t) => t.type === typeName && t.namespace === typeNamespace);
          if (!match) {
            typesArray.push({
              type: typeName,
              namespace: typeNamespace
            });
          }
        }
      }

      // Check in attributes for xsi-type
      if (element?.attributes && typeof element.attributes === "object") {
        for (const attr in element.attributes) {
          if (attr === "xsi:type" && element.attributes["xsi:type"].includes(":")) {
            const at = element.attributes["xsi:type"];
            const typeName = at.split(":")[1];
            const typeNamespaceId = at.split(":")[0];
            let typeNamespace = namespaces.find((ns) => ns.id === typeNamespaceId);
            if (typeNamespace) {
              typeNamespace = typeNamespace.namespace;
              // Add the xsi-type if it has not been already added
              if (typeNamespace) {
                const match = typesArray.find((t) => t.type === typeName && t.namespace === typeNamespace);
                if (!match) {
                  typesArray.push({
                    type: typeName,
                    namespace: typeNamespace
                  });
                }
              }
            }
          }
        }
      }

      // Recursively check children
      if (element.children && Array.isArray(element.children) && element.children.length > 0) {
        element.children.forEach((child) => {
          searchForXSIType(child, typesArray, level + 1);
        });
      }

      // Return all the found types
      return typesArray;
    }

    // Find all the XSI types
    const types = searchForXSIType(response);

    // Add the types to the common array
    if (types && Array.isArray(types)) {
      types.forEach((type) => {
        if (type.type && type.namespace && !xsiTypes.find((t) => t.type === type.type && t.namespace === type.namespace)) {
          xsiTypes.push(type);
        }
      });
    }
  });

  // Return the found types
  return xsiTypes;
};

/**
 * Resolves and creates an object containing all inherited properties and element-types for a given root-type
 *
 * @param currentObject
 * @param {string} typeName - The type name to resolve
 * @param {string} namespace - The target namespace
 * @param {number} level - The current recursion level
 * @returns {*} - The resolved object or an empty object if not found
 */
const resolveType = (currentObject, typeName, namespace, level = 0) => {
  if (!typeName || !namespace) {
    return currentObject;
  }

  // Attempt to find the correct schema
  const schema = findSchemaForNamespace(namespace);
  // Read the file
  const parsed = readFile(schema, { parsed: true });
  // Retrieve the namespaces of the file
  const namespaces = getNamespacesAndSchemaLocations(parsed);

  // Find the type in the file
  let foundType;
  xmlQuery(parsed)
    .find("xs:complexType")
    .each((type) => {
      if (type.attributes && type.attributes.name === typeName) {
        foundType = type;
      }
    });

  if (!foundType) {
    return currentObject;
  }

  // Check if the type has any extensions
  const extension = xmlQuery(foundType).find("xs:extension");
  if (extension?.attr("base")) {
    const extensionNamespaceId = extension.attr("base").split(":")[0];
    const extensionType = extension.attr("base").split(":")[1];
    let extensionNamespace;

    const matchNamespace = namespaces.find((ns) => ns.id === extensionNamespaceId);
    if (matchNamespace?.namespace) {
      extensionNamespace = matchNamespace.namespace;
    }

    const extensionObject = resolveType(currentObject, extensionType, extensionNamespace, level + 1);

    // Add all extension objects to the return object
    if (extensionObject && Object.keys(extensionObject).length > 0) {
      for (const obj in extensionObject) {
        // log(level + 3, '-', obj)
        if (obj.startsWith("$")) {
          return;
        }
        currentObject[obj] = {
          $inherited: true,
          ...extensionObject[obj]
        };
      }
    }
  }

  // Add all elements to the object
  xmlQuery(foundType)
    .find("xs:element")
    .each((element) => {
      const attrs = element.attributes;
      if (!(attrs.name && attrs.type)) {
        return;
      }

      currentObject[attrs.name] = {
        _type: attrs.type.split(":")[1],
        _namespaceId: attrs.type.split(":")[0]
      };
      const matchNamespace = namespaces.find((ns) => ns.id === currentObject[attrs.name]._namespaceId);
      if (matchNamespace?.namespace) {
        currentObject[attrs.name]._namespace = matchNamespace.namespace;
      }

      if (currentObject[attrs.name]._namespace && currentObject[attrs.name]._namespace.startsWith("http://matrikkel")) {
        resolveType(currentObject[attrs.name], currentObject[attrs.name]._type, currentObject[attrs.name]._namespace, level + 1);
      }
    });

  return currentObject;
};

/**
 * Find elementtype in other type
 *
 * @param {string} namespace - The target namespace
 * @param {string} typeName - The type name
 * @param [elementName]
 * @returns {*} - The resolved element type
 */
const findElementTypeInOtherType = (namespace, typeName, elementName) => {
  // Input validation
  if (!namespace || !typeName) {
    return;
  }

  return resolveType({}, typeName, namespace, elementName);
};

module.exports = {
  loadAllFiles,
  findAllXsiTypesInXml,
  findElementTypeInOtherType
};
