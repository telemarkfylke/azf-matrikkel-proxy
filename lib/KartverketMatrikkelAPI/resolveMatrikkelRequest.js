// const { loadAllFiles, findAllXsiTypesInXml, findElementTypeInOtherType } = require('../WSDLClient/WSDLClient')
// const XmlReader = require('xml-reader')

// const resolveMatrikkelRequest = async (rawXML, parsedJSON) => {
//   // Input validation
//   if (!rawXML || !parsedJSON) {
//     return parsedJSON
//   }

//   // Make sure that all WSDLClients are loaded into memory
//   loadAllFiles()

//   // Parse the XML using XML Reader - this is used for generating the type schemas
//   const parsedXML = XmlReader.parseSync(rawXML)

//   // Retrieve all the XSI types in the XML data
//   const xsiTypes = findAllXsiTypesInXml(parsedXML)

//   // Parse the XML to JSON - This will be modified with the generated schema and be returned to the caller
//   let jsonBody = parsedJSON
//   if (parsedJSON && parsedJSON.Envelope && parsedJSON.Envelope.Body) {
//     jsonBody = parsedJSON.Envelope.Body
//   }
//   if (!Array.isArray(jsonBody)) { jsonBody = [jsonBody] }

//   // Resolve and generate the schema for all the types
//   if (xsiTypes) {
//     xsiTypes.forEach((type) => {
//       const resolved = findElementTypeInOtherType(type.namespace, type.type)
//       if (resolved) {
//         type.schema = {
//           _type: type.type,
//           _namespace: type.namespace,
//           ...resolved
//         }
//       }
//     })
//   }

//   // Function for updating JSON-data with information in the generated schemas
//   // This will have to be done from top to bottom
//   const brreg = {}
//   async function updateJSON (parent, parentKey, current, currentKey, schema, schemaKey, childIndex, level = 0) {
//     if (!current) return
//     if (currentKey && currentKey === 'brreg') return
//     if (currentKey && currentKey === 'dsf') return
//     // Check if the current property has a specified xsi:type, if so attempt to change to a matching schema
//     let xsiType
//     if (current.$ && current.$['xsi:type']) {
//       xsiType = current.$['xsi:type'].split(':')[1]

//       const tmpSchema = xsiTypes.find((type) => type.type === xsiType)
//       if (tmpSchema && tmpSchema.schema) {
//         schema = tmpSchema.schema
//       }
//     }

//     // Assume that the type information is unresolved
//     let schemaType = 'unresolved'
//     let schemaNamespace = 'unresolved'

//     // Check if the schema matches with the next level
//     if (schema && currentKey !== schemaKey && schema[currentKey]) {
//       schema = schema[currentKey]
//     }

//     if (schema) {
//       schemaType = schema._type || 'unresolved'
//       schemaNamespace = schema._namespace || 'unresolved'
//     }

//     // Check if Brreg should be contacted
//     if (xsiType && xsiType === 'JuridiskPerson' && current.nummer) {
//       // inspect(current);
//       if (brreg[current.nummer]) current.brreg = brreg[current.nummer]
//       else {
//         try {
//           const company = await getCompanyFromBrreg(current.nummer)
//           if (company) {
//             brreg[current.nummer] = company
//             current.brreg = brreg[current.nummer]
//           }
//         } catch (err) {
//           console.error(err)
//         }
//       }
//     }

//     let addedValue = false
//     if (typeof current === 'object') {
//       current = {
//         _type: schemaType,
//         _namespace: schemaNamespace,
//         ...current
//       }
//     } else {
//       current = {
//         _type: schemaType,
//         _namespace: schemaNamespace,
//         value: current
//       }
//       addedValue = true
//     }

//     if (Array.isArray(parent[currentKey])) {
//       parent[currentKey][childIndex] = current
//     } else {
//       parent[currentKey] = current
//     }

//     let childKeys = Object.keys(current).filter((key) => !key.startsWith('$'))
//     if (addedValue) { childKeys = childKeys.filter((key) => key !== 'value') }
//     for (const key of childKeys) {
//       const nextSchema = schema && schema[key] ? schema[key] : undefined
//       if (!Array.isArray(current[key])) {
//         await updateJSON(current, currentKey, current[key], key, nextSchema, key, 0, level + 1)
//       } else {
//         for (let i = 0; i < current[key].length; i++) {
//           await updateJSON(current, currentKey, current[key][i], key, nextSchema, key, i, level + 1)
//         }
//       }
//     }

//     return current
//   }

//   // Update the JSON data with schema information
//   if (xsiTypes) {
//     // For each response in the JSON body
//     for (let i = 0; i < jsonBody.length; i++) {
//       const response = jsonBody[i]
//       // Get the name of the current response
//       const name = Object.keys(response)[0]
//       // Get the data of the current response
//       const data = response[name]
//       // Get all child-keys for the response
//       const childKeys = Object.keys(data).filter((key) => !key.startsWith('$'))
//       // Attempt to find a schema for the response type
//       let schema = xsiTypes.find((type) => type.type === name)
//       if (schema && schema.schema) { schema = schema.schema || undefined }

//       // Loop through all items in the response
//       for (const key of childKeys) {
//         const updatedData = await updateJSON(data, name, data[key], key, schema)
//         if (updatedData) jsonBody[i] = updatedData
//       }
//     }
//   }

//   // Return the JSON body
//   return jsonBody
// }

// module.exports = {
//   resolveMatrikkelRequest
// }
