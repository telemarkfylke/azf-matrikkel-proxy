// const { cleanUpXML } = require('../helpers/cleanUpXML')
// const { prettifyXML } = require('../helpers/prettyfyXml')
// const xml2js = require('xml2js')

// const makeMatrikkelRequest = async (req, body) => {
//   // Input validation
//   if (!body) {
//     throw new Error('makeRequest: body cannot be empty')
//   }

//   // Prettify the request body
//   body = prettifyXML(body)

//   // Define the body
//   const fetchRequest = {
//     method: 'POST',
//     cache: 'no-cache',
//     redirect: 'follow',
//     headers: {
//       'Content-Type': 'text/xml;charset=UTF-8',
//       'Access-Control-Allow-Origin': '*',
//       Authorization: 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64')
//     },
//     body
//   }

//   // Make the request
//   const response = await fetch(this.endpoint, fetchRequest)
//   // Retrieve the response body
//   let responseBody = await response.text()

//   // Remove some unnecessary tag-info to make parsing easier
//   responseBody = cleanUpXML(responseBody)
//   let cleanJSON = cleanUpXML(responseBody, true)

//   // The MatrikkelAPI returns status 200 and HTML if the request is unauthenticated or unauthorized, check for this as it will fail on the XML and JSON parsing below.
//   const notOkContent = ['<!DOCTYPE HTML', '401 Unauthorized']

//   let errorMessage = ''
//   notOkContent.forEach((phrase) => {
//     if (responseBody.includes(phrase)) {
//       errorMessage = 'The returned response from the Matrikkel API was invalid\r\nThe request might be unauthorized\r\n' + responseBody
//     }
//   })
//   if (errorMessage) throw new Error(errorMessage)

//   // Parse the XML and convert it to JSON
//   cleanJSON = await xml2js.parseStringPromise(cleanJSON, { explicitArray: false })

//   // Attempt to find the JSON body
//   if (cleanJSON && cleanJSON.Envelope && cleanJSON.Envelope.Body) {
//     cleanJSON = cleanJSON.Envelope.Body
//   }

//   // If resolve = true, do a full resolve of every part of the request
//   // If not just lightly resolve by parsing found xsi-types and moving them to _type
//   if (req.query.get("resolve")) {
//     const tmp = await this.resolveRequest(responseBody, cleanJSON)

//     if (tmp) responseBody = tmp
//     else responseBody = cleanJSON
//   } else {
//     cleanJSON = await this.lightlyResolveRequest(responseBody, cleanJSON)
//     responseBody = cleanJSON
//   }

//   if (!Array.isArray(responseBody)) { responseBody = [responseBody] }

//   // Flatten the respons returning only the items
//   if (req.query.get("flatten")) {
//     // This is the items that is returned under the envelope/boiler information
//     const items = []

//     // Start by stripping away all metadata, boilerplate, etc. So we are left with only the data items
//     for (let i = 0; i < responseBody.length; i++) {
//       let response = responseBody[i]
//       const firstProperty = response[Object.keys(response)[0]]

//       // Find all items in the data
//       if (response.item) {
//         if (Array.isArray(response.item)) items.push(...response.item)
//         else items.push(response.item)
//       } else if (response.items) {
//         if (Array.isArray(response.item)) items.push(...response.items)
//         else items.push(response.items)
//       } else if (firstProperty && firstProperty.return) {
//         response = firstProperty
//         if (response.return && response.return.item) {
//           if (Array.isArray(response.return.item)) {
//             response.return.item.forEach((item) => {
//               if (item.value && Object.keys(item).length === 1) items.push(item.value)
//               else items.push(item)
//             })
//           } else {
//             items.push(response.return.item)
//           }
//         }
//       } else {
//         items.push(response)
//       }
//     }

//     // Then flatten all the reminding data
//     const flattenedItems = []
//     items.forEach((item) => {
//       flattenedItems.push(MatrikkelClient.flattenObject(item))
//     })
//     responseBody = flattenedItems
//   }

//   return responseBody
// }

// module.exports = {
//   makeMatrikkelRequest
// }
