# Test fixtures

- `soap/`: answers from Matrikkel's SOAP API, written from Kartverket's XSDs (units, plots, persons,
  a single item, an empty answer and a fault). Made-up data.
- `enrichment.cjs`: what azf-freg and Brønnøysund answer for the owners in those answers.
- `legacy/`: what the JavaScript version (1.1.4) answered for each SOAP fixture, recorded by running
  its handlers with fetch, FREG and Brreg replaced by fakes (`scripts/legacy-golden.cjs`, removed
  together with the JavaScript code; see the git history). `test/unit/legacy.test.ts` checks that
  the compatible endpoints still answer the same. `soapRequest` is the SOAP request it sent.
