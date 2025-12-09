const cleanUpXML = (xml, full) => {
  // Input validation
  if (!xml) {
    return;
  }

  // Remove some unnecessary tag-info to make parsing easier
  xml = xml.replace(/<[a-zA-Z]:/g, "<");
  xml = xml.replace(/<\/[a-zA-Z]:/g, "</");

  if (full) {
    xml = xml.replace(/<[a-zA-Z]+[0-9]+:/g, "<");
    xml = xml.replace(/<\/[a-zA-Z]+[0-9]+:/g, "</");
  }

  return xml;
};

module.exports = {
  cleanUpXML
};
