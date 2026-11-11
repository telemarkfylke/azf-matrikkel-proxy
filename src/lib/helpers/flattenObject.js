// Recursively makes an object as flat as possible
// Example: If a key contains only one child key, containing a string. Bring that string directly to the parent key
// This is to make the data easier to work with not having an unnecessary deep objects

const flattenObject = (obj) => {
  function flatten(current, currentKey, parent) {
    if (!current) {
      return;
    }

    if (currentKey === "$") {
      return;
    }

    // Delete metadata-fields
    if (currentKey === "metadata") {
      delete parent[currentKey];
      return;
    }

    // Recursively go down all properties
    if (typeof current === "object") {
      Object.keys(current).forEach((key) => {
        flatten(current[key], key, current);
      });
    }

    if (typeof current !== "object") {
      return;
    }

    if (Object.keys(current).length === 1) {
      if (Object.keys(current)[0] !== "$") {
        parent[currentKey] = current[Object.keys(current)[0]];
      }
    } else if (Object.keys(current).length === 2 && current.$ !== undefined) {
      const key = Object.keys(current).find((k) => k !== "$");
      if (key && typeof current[key] !== "object") {
        parent[currentKey] = current[key];
      }
    }
  }

  const copy = JSON.parse(JSON.stringify(obj));

  Object.keys(copy).forEach((key) => {
    flatten(copy[key], key, copy);
  });

  return copy;
};

module.exports = {
  flattenObject
};
