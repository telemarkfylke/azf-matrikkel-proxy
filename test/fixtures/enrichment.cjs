// FREG (as azf-freg answers, repacked) and Brreg answers for the owners in the SOAP fixtures.
// Shared by the legacy golden script and the tests. Made-up people.

const FREG = {
  "01019012345": {
    foedselsEllerDNummer: "01019012345",
    status: "bosatt",
    kanKontaktes: true,
    fornavn: "Kari",
    etternavn: "Nordmann",
    fulltnavn: "Kari Nordmann",
    foedselsdato: "1990-01-01",
    alder: 36,
    doedsfall: null,
    adressebeskyttelse: [],
    bostedsadresse: { adressegradering: "ugradert", adresse: "Gata 1", postnummer: "3700", poststed: "SKIEN", kommunenummer: "4003" },
    postadresse: { adresse: "Gata 1", postnummer: "3700", poststed: "SKIEN" }
  },
  "02029012345": {
    foedselsEllerDNummer: "02029012345",
    status: "bosatt",
    kanKontaktes: true,
    fornavn: "Hemmelig",
    etternavn: "Person",
    fulltnavn: "Hemmelig Person",
    foedselsdato: "1990-02-02",
    alder: 36,
    doedsfall: null,
    adressebeskyttelse: ["strengtFortrolig"],
    bostedsadresse: { adressegradering: "strengtFortrolig", adresse: "Skjult adresse 9", postnummer: "0000", poststed: "UKJENT" },
    postadresse: { adresse: "Postboks 1", postnummer: "0000", poststed: "UKJENT" }
  }
};

const BRREG = {
  940192226: {
    organisasjonsnummer: "940192226",
    navn: "TELEMARK FYLKESKOMMUNE",
    organisasjonsform: { kode: "FYLK", beskrivelse: "Fylkeskommune" },
    postadresse: { land: "Norge", postnummer: "3706", poststed: "SKIEN", adresse: ["Postboks 2844"] },
    forretningsadresse: { land: "Norge", postnummer: "3715", poststed: "SKIEN", adresse: ["Fylkesbakken 10"] },
    slettedato: "2020-04-01"
  }
};

module.exports = { FREG, BRREG };
