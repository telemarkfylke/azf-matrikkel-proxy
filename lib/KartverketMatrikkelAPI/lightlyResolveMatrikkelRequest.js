// const XmlReader = require('xml-reader')
// const { findAllXsiTypesInXml } = require('../WSDLClient/WSDLClient')

// // Resolve just the items that have specified xsi type
// const lightlyResolveRequest = async (rawXML, parsedJSON) => {
//   // Input validation
//   if (!rawXML || !parsedJSON) { return }

//   // Parse the XML using XML Reader - this is used for generating the type schemas
//   const parsedXML = XmlReader.parseSync(rawXML)

//   // Retrieve all the XSI types in the XML data
//   const xsiTypes = findAllXsiTypesInXml(parsedXML)

//   // Make a copy to not edit the source data
//   let copy = JSON.parse(JSON.stringify(parsedJSON))

//   // Make sure that the input if array
//   if (!Array.isArray(copy)) { copy = [copy] }

//   // Function to recursively resolve the xsi-types
//   const brreg = {}
//   const dsf = {}
//   async function lightlyResolve (item, key, parent) {
//     if (!item) return
//     // Recursively check every child if array
//     if (Array.isArray(item)) {
//       for (let i = 0; i < item.length; i++) {
//         await lightlyResolve(item[i], key, item)
//       }
//     }

//     // Recursively check every property if present
//     if (typeof item === 'object') {
//       for (const key of Object.keys(item)) {
//         await lightlyResolve(item[key], key, item)
//       }
//     }

//     // Check for type information
//     if (item.$ && item.$['xsi:type']) {
//       let type = item.$['xsi:type']
//       if (type.includes(':')) {
//         type = type.split(':')[1]
//       }

//       const updatedTypeinfo = {
//         _type: type
//       }

//       // Contact brreg and add information to the company
//       if (type === 'JuridiskPerson' && item.nummer) {
//         if (brreg[item.nummer]) parent[key].brreg = brreg[item.nummer]
//         else {
//           try {
//             const company = await getCompanyFromBrreg(item.nummer)
//             if (company) {
//               if (company.slettedato && parent[key]) {
//                 parent[key].avviklet = true
//               }
//               brreg[item.nummer] = company
//               item.brreg = brreg[item.nummer]
//             } else {
//               if (parent[key]) parent[key].avviklet = true
//             }
//           } catch (err) {
//             throw new AppError(`Dette er en ekstern feil\n${err.message}`, 'Kunne ikke koble til Brønnøysund registeret')
//           }
//         }
//       } else if (type === 'FysiskPerson' && item.nummer) {
//         if (dsf[item.nummer]) parent[key].dsf = dsf[item.nummer]
//         else {
//           dsf[item.nummer] = await getPersonFromDsf(item.nummer)

//           if (dsf[item.nummer]) {
//             // Get the owner from the cache
//             item.dsf = dsf[item.nummer]

//             // Check if the owner is utvandret
//             if (item.dsf['STAT-KD'] === 3 || (item.dsf.ADR && item.dsf.ADR.toUpperCase() === 'UTVANDRET')) item.utvandret = true
//             // Check if the owner is forsvunnet
//             if (item.dsf['STAT-KD'] === 4 || (item.dsf.ADR && item.dsf.ADR.toUpperCase() === 'FORSVUNNET')) item.forsvunnet = true
//             // Check if the owner is dead
//             if (item.dsf['STAT-KD'] === 5 || (item.dsf.ADR && item.dsf.ADR.toUpperCase() === 'DØD')) item.dead = true
//             // Check if the owner has any other reason not to be contacted
//             const spesCode = parseInt(dsf[item.nummer]['SPES-KD'])
//             if (spesCode === 4 || spesCode === 6 || spesCode === 7) {
//               parent[key].handleManually = true
//               // Delete the matrikkel address information
//               delete parent[key].postadresse
//               delete parent[key].bostedsadresse
//             }
//           }
//         }
//       }

//       // Check for at match in the resolved xsi-types
//       const xsiMatch = xsiTypes.find((t) => t.type === type)
//       if (xsiMatch && xsiMatch.namespace) {
//         updatedTypeinfo._namespace = xsiMatch.namespace
//       }

//       // In try catch so it don't ruin the entire request if this somehow fails
//       try {
//         if (parent[key]) {
//           parent[key] = {
//             ...updatedTypeinfo,
//             ...parent[key]
//           }
//         } else {
//           parent = {
//             ...updatedTypeinfo,
//             ...parent
//           }
//         }
//       } catch {}
//     }

//     // Attempt to strip away the '$' property if all necessary information has been retrieved
//     if (item.$ && item.$['xsi:type'] && Object.keys(item.$).length <= 2) {
//       try {
//         delete parent[key].$
//       } catch {}
//     }

//     return item
//   }

//   // Resolve each item
//   for (let item of copy) {
//     item = await lightlyResolve(item, undefined, undefined)
//   }

//   return copy
// }

// module.exports = {
//   lightlyResolveRequest
// }
