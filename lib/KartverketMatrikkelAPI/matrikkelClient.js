/*
   Import dependencies
*/
const XmlReader = require('xml-reader') // Reads XML in a format that can be used by xml-query for working with the data
const xml2js = require('xml2js') // For converting XML to JSON
const Sjablong = require('@vtfk/sjablong') // Replace placeholders in templates
const { brregbyOrgNr } = require('../apiCalls/call-brreg')
const { fregBySSN } = require('../apiCalls/call-freg')
const prettifyXml = require('prettify-xml')
const { cleanUpXML } = require('../helpers/cleanUpXML')
const { flattenObject } = require('../helpers/flattenObject')
const WSDLClient = require('../WSDLClient/WSDLClient')
const TemplateClient = require('../TemplateClient/TemplateClient')
const { matrikkelApi } = require('../../config')
const fetch = require('node-fetch')

/**
 * A class for contacting the Matrikkel
 * If the response contains persons FREG will be contacted, used to be DSF.
 * If the response contains businesses Brreg will be contacted
 * It is probably a way to big implemtation that should be refactored
 * A lot of code has to do with cleaning up and simplifying the response.
 * There is also a lot of code to match the data with wsdl-schemas to resolve type-information.
 */

class MatrikkelClient {
  constructor (username, password, endpoint, baseurl) {
    this.baseurl = baseurl || matrikkelApi.MATRIKKELAPI_BASEURL
    this.username = username || matrikkelApi.MATRIKKELAPI_USERNAME
    this.password = password || matrikkelApi.MATRIKKELAPI_USERNAME
    if (!endpoint) throw new Error('Endpoint must be specified')
    if (endpoint.startsWith('http')) throw new Error('Endpoint cannot be a complete url')
    this.endpoint = this.baseurl + endpoint
  }

  prettifyXML (xml) {
    if (!xml) { return '' }

    const options = {
      indent: 2,
      newline: '\n'
    }

    return prettifyXml(xml, options)
  }

  // Resolve the response before sending
  async resolveRequest (rawXML, parsedJSON) {
    // Input validation
    if (!rawXML || !parsedJSON) {
      return parsedJSON
    }

    // Make sure that all WSDLClients are loaded into memory
    WSDLClient.loadAllFiles()

    // Parse the XML using XML Reader - this is used for generating the type schemas
    const parsedXML = XmlReader.parseSync(rawXML)

    // Retreive all the XSI types in the XML data
    const xsiTypes = WSDLClient.findAllXsiTypesInXml(parsedXML)

    // Parse the XML to JSON - This will be modified with the generated schema and be returned to the caller
    let jsonBody = parsedJSON
    if (parsedJSON && parsedJSON.Envelope && parsedJSON.Envelope.Body) {
      jsonBody = parsedJSON.Envelope.Body
    }
    if (!Array.isArray(jsonBody)) { jsonBody = [jsonBody] }

    // Resolve and generate the schema for all the types
    if (xsiTypes) {
      xsiTypes.forEach((type) => {
        const resolved = WSDLClient.findElementTypeInOtherType(type.namespace, type.type)
        if (resolved) {
          type.schema = {
            _type: type.type,
            _namespace: type.namespace,
            ...resolved
          }
        }
      })
    }

    // Function for updating JSON-data with information in the generated schemas
    // This will have to be done from top to bottom
    const brreg = {}
    async function updateJSON (parent, parentKey, current, currentKey, schema, schemaKey, childIndex, level = 0) {
      if (!current) return
      if (currentKey && currentKey === 'brreg') return
      if (currentKey && currentKey === 'dsf') return
      // Check if the current property has an specified xsi:type, if so attempt to change to a matching schema
      let xsiType
      if (current.$ && current.$['xsi:type']) {
        xsiType = current.$['xsi:type'].split(':')[1]

        const tmpSchema = xsiTypes.find((type) => type.type === xsiType)
        if (tmpSchema && tmpSchema.schema) {
          schema = tmpSchema.schema
        }
      }

      // Assume that the typeinformation is unresolved
      let schemaType = 'unresolved'
      let schemaNamespace = 'unresolved'

      // Check if the schema matches with the next level
      if (schema && currentKey !== schemaKey && schema[currentKey]) {
        schema = schema[currentKey]
      }

      if (schema) {
        schemaType = schema._type || 'unresolved'
        schemaNamespace = schema._namespace || 'unresolved'
      }

      // Check if Brreg should be contacted
      if (xsiType && xsiType === 'JuridiskPerson' && current.nummer) {
        // inspect(current);
        if (brreg[current.nummer]) current.brreg = brreg[current.nummer]
        else {
          try {
            const company = await brregbyOrgNr(current.nummer)
            if (company) {
              brreg[current.nummer] = company
              current.brreg = brreg[current.nummer]
            }
          } catch (err) {
            console.error(err)
          }
        }
      }

      let addedValue = false
      if (typeof current === 'object') {
        current = {
          _type: schemaType,
          _namespace: schemaNamespace,
          ...current
        }
      } else {
        current = {
          _type: schemaType,
          _namespace: schemaNamespace,
          value: current
        }
        addedValue = true
      }

      if (Array.isArray(parent[currentKey])) {
        parent[currentKey][childIndex] = current
      } else {
        parent[currentKey] = current
      }

      let childKeys = Object.keys(current).filter((key) => !key.startsWith('$'))
      if (addedValue) { childKeys = childKeys.filter((key) => key !== 'value') }
      for (const key of childKeys) {
        const nextSchema = schema && schema[key] ? schema[key] : undefined
        if (!Array.isArray(current[key])) {
          await updateJSON(current, currentKey, current[key], key, nextSchema, key, 0, level + 1)
        } else {
          for (let i = 0; i < current[key].length; i++) {
            await updateJSON(current, currentKey, current[key][i], key, nextSchema, key, i, level + 1)
          }
        }
      }

      return current
    }

    // Update the JSON data with schema information
    if (xsiTypes) {
      // For each response in the JSON body
      for (let i = 0; i < jsonBody.length; i++) {
        const response = jsonBody[i]
        // Get the name of the current respose
        const name = Object.keys(response)[0]
        // Get the data of the current respose
        const data = response[name]
        // Get all child-keys for the response
        const childKeys = Object.keys(data).filter((key) => !key.startsWith('$'))
        // Attempt to find a schema for the response type
        let schema = xsiTypes.find((type) => type.type === name)
        if (schema && schema.schema) { schema = schema.schema || undefined }

        // Loop through all items in the response
        for (const key of childKeys) {
          const updatedData = await updateJSON(data, name, data[key], key, schema)
          if (updatedData) jsonBody[i] = updatedData
        }
      }
    }

    // Return the JSON body
    return jsonBody
  }

  // Resolve just the items that have specified xsi type
  async lightlyResolveRequest (rawXML, parsedJSON) {
    // Input validation
    if (!rawXML || !parsedJSON) { return }

    // Parse the XML using XML Reader - this is used for generating the type schemas
    const parsedXML = XmlReader.parseSync(rawXML)

    // Retreive all the XSI types in the XML data
    const xsiTypes = WSDLClient.findAllXsiTypesInXml(parsedXML)

    // Make a copy to not edit the source data
    let copy = JSON.parse(JSON.stringify(parsedJSON))

    // Make sure that the input is an array
    if (!Array.isArray(copy)) { copy = [copy] }

    // Function to recurively resolve the xsi-types
    const brreg = {}
    const freg = {}
    async function lighlyResolve (item, key, parent) {
      if (!item) return
      // Recursively check every child if array
      if (Array.isArray(item)) {
        for (let i = 0; i < item.length; i++) {
          await lighlyResolve(item[i], key, item)
        }
      }

      // Recursively check every property if present
      if (typeof item === 'object') {
        for (const key of Object.keys(item)) {
          await lighlyResolve(item[key], key, item)
        }
      }

      // Check for type information
      if (item.$ && item.$['xsi:type']) {
        let type = item.$['xsi:type']
        if (type.includes(':')) {
          type = type.split(':')[1]
        }

        const updatedTypeinfo = {
          _type: type
        }

        // Contact brreg and add information to the company
        if (type === 'JuridiskPerson' && item.nummer) {
          if (brreg[item.nummer]) parent[key].brreg = brreg[item.nummer]
          else {
            try {
              const company = await brregbyOrgNr(item.nummer)
              if (company) {
                if (company.slettedato && parent[key]) {
                  parent[key].avviklet = true
                }
                brreg[item.nummer] = company
                item.brreg = brreg[item.nummer]
              } else {
                if (parent[key]) parent[key].avviklet = true
              }
            } catch (err) {
              throw new Error(`Dette er en ekstern feil\n${err.message}`, 'Kunne ikke koble til Brønnøysund registeret')
            }
          }
        } else if (type === 'FysiskPerson' && item.nummer) {
          if (freg[item.nummer]) parent[key].freg = freg[item.nummer]
          else {
            freg[item.nummer] = await fregBySSN(item.nummer, false, true)
            if (freg[item.nummer]) {
              // Get the owner from the cache
              item.freg = freg[item.nummer]
              // Check if the owner can be contacted
              if (item.freg.kanKontaktes === false) {
                // Not able to contact the owner
                item.kanIkkeKontaktes = true
              } else if (item.freg.kanKontaktes === true) {
                if (item.freg.status !== 'inaktiv') {
                  // Check for "fortrolig", "strengtFortrolig" or "klientadresse"
                  const illigalGrading = ['fortrolig', 'strengtFortrolig', 'klientadresse']
                  if (illigalGrading.includes(item.freg.bostedsadresse?.adressegradering)) {
                    item.handleManually = true
                    // Delete the matrikkel adress info.
                    delete parent[key].bostedsadresse
                    delete parent[key].postadresse
                  }
                } else if (item.freg.status === 'inaktiv') {
                  // Person with inactive D-number must handle manually
                  item.handleManually = true
                }
              }
            }
          }
        }

        // Check for at match in the resolved xsi-types
        const xsiMatch = xsiTypes.find((t) => t.type === type)
        if (xsiMatch && xsiMatch.namespace) {
          updatedTypeinfo._namespace = xsiMatch.namespace
        }

        // In try catch so it don't ruins the entire request if this somehow fails
        try {
          if (parent[key]) {
            parent[key] = {
              ...updatedTypeinfo,
              ...parent[key]
            }
          } else {
            parent = {
              ...updatedTypeinfo,
              ...parent
            }
          }
        } catch {}
      }

      // Attempt to strip away the '$' property if all necessary information has been retreived
      if (item.$ && item.$['xsi:type'] && Object.keys(item.$).length <= 2) {
        try {
          delete parent[key].$
        } catch {}
      }

      return item
    }

    // Resolve each item
    for (let item of copy) {
      item = await lighlyResolve(item, undefined, undefined)
    }

    return copy
  }

  // Makes the request to the Kartverket Matrikkel SOAP API
  async makeRequest (req, body) {
    // Input validation
    if (!body) {
      throw new Error('makeRequest: body cannot be empty')
    }

    // Prettify the request body
    body = this.prettifyXML(body)

    // Define the body
    const fetchRequest = {
      method: 'POST',
      cache: 'no-cache',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        Authorization: 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64')
      },
      body
    }
    // Make the request
    let responseBody
    try {
      const response = await fetch(this.endpoint, fetchRequest)
      // Retreive the response body
      responseBody = await response.text()
    } catch (error) {
      return error
    }

    // Remove some uneccessary tag-info to make parsing easier
    responseBody = cleanUpXML(responseBody)
    let cleanJSON = cleanUpXML(responseBody, true)

    // The MatrikkelAPI returns status 200 and HTML if the request is unauthenticated or unauthorized, check for this as it will fail on the XML and JSON parsing below.
    const notOkContent = ['<!DOCTYPE HTML', '401 Unauthorized']

    let errorMessage = ''
    notOkContent.forEach((phrase) => {
      if (responseBody.includes(phrase)) {
        errorMessage = 'The returned response from the Matrikkel API was invalid\r\nThe request might be unauthorized\r\n' + responseBody
      }
    })
    if (errorMessage) throw new Error(errorMessage)

    // Parse the XML and convert it to JSON
    cleanJSON = await xml2js.parseStringPromise(cleanJSON, { explicitArray: false })

    // Attempt to find the JSON body
    if (cleanJSON && cleanJSON.Envelope && cleanJSON.Envelope.Body) {
      cleanJSON = cleanJSON.Envelope.Body
    }

    // If resolve = true, do a full resolve of every part of the request
    // If not just lightly resolve by parsing found xsi-types and moving them to _type
    if (req.query.resolve) {
      const tmp = await this.resolveRequest(responseBody, cleanJSON)

      if (tmp) responseBody = tmp
      else responseBody = cleanJSON
    } else {
      cleanJSON = await this.lightlyResolveRequest(responseBody, cleanJSON)
      responseBody = cleanJSON
    }

    if (!Array.isArray(responseBody)) { responseBody = [responseBody] }

    // Flatten the respons returning only the items
    if (req.query.flatten) {
      // This is the items that is returned under the envelope/boiler information
      const items = []

      // Start by stripping away all metadata, boilerplate, etc. So we are left with only the data items
      for (let i = 0; i < responseBody.length; i++) {
        let response = responseBody[i]
        const firstProperty = response[Object.keys(response)[0]]

        // Find all items in the data
        if (response.item) {
          if (Array.isArray(response.item)) items.push(...response.item)
          else items.push(response.item)
        } else if (response.items) {
          if (Array.isArray(response.item)) items.push(...response.items)
          else items.push(response.items)
        } else if (firstProperty && firstProperty.return) {
          response = firstProperty
          if (response.return && response.return.item) {
            if (Array.isArray(response.return.item)) {
              response.return.item.forEach((item) => {
                if (item.value && Object.keys(item).length === 1) items.push(item.value)
                else items.push(item)
              })
            } else {
              items.push(response.return.item)
            }
          }
        } else {
          items.push(response)
        }
      }

      // Then flatten all the reminding data
      const flattenedItems = []
      items.forEach((item) => {
        flattenedItems.push(flattenObject(item))
      })
      responseBody = flattenedItems
    }

    return responseBody
  }

  async getMatrikkelPolygon (req, polygon) {
    // Input validation
    if (!polygon) { return }

    const requestTemplate = TemplateClient.getTemplate('findMatrikkelenheterPolygon.xml')

    let coordinatesString = ''
    polygon.forEach((p) => {
      const coordinates = {
        x: p[0],
        y: p[1]
      }
      const item = Sjablong.replacePlaceholders(TemplateClient.getTemplate('geomPolygon.xml'), coordinates)
      coordinatesString += item
    })

    const data = {
      koordinatsystemKodeId: req.body.koordinatsystemKodeId || req.body.matrikkelContext.koordinatsystemKodeId,
      positions: coordinatesString,
      matrikkelContext: req.matrikkelContext
    }

    const requestBody = Sjablong.replacePlaceholders(requestTemplate, data)

    return await this.makeRequest(req, requestBody)
  }

  /*
    Store service
  */
  async callStoreService (req, body) {
    // Array for storing all the found namespaces in the request as well as an unique generated id
    const namespaces = []
    let itemsXML = ''

    // Enumurate all items and do the following
    // 1. Find all unique namespaces and assign a ID to it
    // 2. Generate item XML from template
    body.forEach((item) => {
      // Find or register namespace
      let namespace = namespaces.find(ns => ns.namespace === item.namespace || ns.namespace === item._namespace)
      if (!namespace) {
        namespaces.push({
          id: 'ns' + (namespaces.length + 1),
          namespace: item.namespace || item._namespace
        })
        namespace = namespaces[namespaces.length - 1]
      }

      // Generate item XML
      let itemTemplate = TemplateClient.getTemplate('storeServiceItem.xml')
      itemTemplate = Sjablong.replacePlaceholders(itemTemplate, {
        namespaceId: namespace.id,
        itemType: item.type,
        itemValue: item.value
      })

      itemsXML += itemTemplate
    })

    // Generate the namespace string
    let namespaceString = ''
    namespaces.forEach((ns) => {
      namespaceString += 'xmlns:' + ns.id + '="' + ns.namespace + '" '
    })
    namespaceString += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'

    // Generate store request template
    let requestTemplate = TemplateClient.getTemplate('storeRequest.xml')
    requestTemplate = Sjablong.replacePlaceholders(requestTemplate, {
      namespaceString,
      items: itemsXML,
      matrikkelContext: req.matrikkelContext
    })

    return await this.makeRequest(req, requestTemplate)
  }
}

module.exports = {
  MatrikkelClient
}
