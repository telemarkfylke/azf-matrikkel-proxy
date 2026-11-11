// Entry point for the Functions host (package.json "main": "dist/src/index.js").
// Each function file registers itself with app.http when imported.

import "./functions/legacy.ts";
import "./functions/v2.ts";
