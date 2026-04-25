#!/usr/bin/env node
import fs from "fs";
import path from "path";

/**
 * Convert an OpenAPI schema to a JSDoc/TypeScript type string.
 * @param {any} schema
 * @returns {string}
 */
function schemaToJSDocType(schema) {
  if (!schema) return "any";

  if (schema.$ref) {
    const parts = schema.$ref.split("/");
    return parts[parts.length - 1];
  }

  if (schema.type === "array" && schema.items) {
    return `${schemaToJSDocType(schema.items)}[]`;
  }

  if (schema.type === "object") {
    if (schema.properties) {
      const entries = Object.entries(schema.properties)
        .map(([key, prop]) => {
          const propType = schemaToJSDocType(prop);
          const isRequired = schema.required?.includes(key);
          return `${key}${isRequired ? "" : "?"}: ${propType}`;
        })
        .join(", ");
      return `{ ${entries} }`;
    }
    return "object";
  }

  if (schema.type === "integer" || schema.type === "number") {
    return schema.nullable ? "number | null" : "number";
  }

  if (schema.type === "string") {
    return schema.nullable ? "string | null" : "string";
  }

  if (schema.type === "boolean") {
    return schema.nullable ? "boolean | null" : "boolean";
  }

  return "any";
}

/**
 * Generate JSDoc typedefs from OpenAPI components/schemas.
 * @param {any} schemas
 * @returns {string}
 */
function generateTypedefs(schemas) {
  if (!schemas) return "";

  const lines = [];
  for (const [name, schema] of Object.entries(schemas)) {
    if (!schema.properties) {
      const typeStr = schemaToJSDocType(schema);
      lines.push(`/** @typedef {${typeStr}} ${name} */`);
      continue;
    }

    lines.push(`/**`);
    lines.push(` * @typedef {Object} ${name}`);
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const jsdocType = schemaToJSDocType(propSchema);
      const desc = propSchema.description || "";
      const isRequired = schema.required?.includes(propName);
      const propNameFormatted = isRequired ? propName : `[${propName}]`;
      lines.push(` * @property {${jsdocType}} ${propNameFormatted}${desc ? ` - ${desc}` : ""}`);
    }
    lines.push(` */`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Generate the fetch client class from an OpenAPI spec.
 * @param {any} spec
 * @returns {string}
 */
function generateClient(spec) {
  const typedefs = generateTypedefs(spec.components?.schemas);

  const classMethods = [];

  for (const [route, methods] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (["get", "post", "patch", "put", "delete"].indexOf(method) === -1) continue;
      if (!operation.operationId) continue;

      const fnName = operation.operationId;
      const pathVars = [];
      const queryVars = [];
      let bodyType = null;

      // Path parameters
      for (const param of operation.parameters || []) {
        if (param.in === "path") {
          pathVars.push({ name: param.name, type: schemaToJSDocType(param.schema) });
        } else if (param.in === "query") {
          queryVars.push({ name: param.name, type: schemaToJSDocType(param.schema) });
        }
      }

      // Request body
      if (operation.requestBody?.content?.["application/json"]?.schema) {
        bodyType = schemaToJSDocType(operation.requestBody.content["application/json"].schema);
      }

      // Response type
      let returnType = "void";
      const successResponse = operation.responses?.["200"] || operation.responses?.["201"];
      if (successResponse?.content?.["application/json"]?.schema) {
        returnType = schemaToJSDocType(successResponse.content["application/json"].schema);
      }

      // Build inline JSDoc param object type
      const paramEntries = [];
      for (const pv of pathVars) {
        paramEntries.push(`${pv.name}: ${pv.type}`);
      }
      for (const qv of queryVars) {
        paramEntries.push(`${qv.name}?: ${qv.type}`);
      }
      if (bodyType) {
        paramEntries.push(`body: ${bodyType}`);
      }

      const hasParams = paramEntries.length > 0;
      const allOptional = pathVars.length === 0 && !bodyType;

      const jsDocParams = hasParams
        ? `   * @param {{ ${paramEntries.join(", ")} }} params`
        : "";

      // Build URL interpolation (strip leading / so paths append to baseUrl)
      let urlExpr = `"${route.replace(/^\//, "")}"`;
      if (pathVars.length) {
        urlExpr = `"${route.replace(/^\//, "")}"`;
        for (const pv of pathVars) {
          urlExpr = urlExpr.replace(`{${pv.name}}`, `\${params.${pv.name}}`);
        }
        urlExpr = "\`" + urlExpr.replace(/"/g, "") + "\`";
      }

      const hasQuery = queryVars.length > 0;

      classMethods.push(`
  /**
   * ${operation.summary || fnName}
${jsDocParams ? jsDocParams + "\n" : ""}   * @returns {Promise<${returnType}>}
   */
  async ${fnName}(${hasParams ? `params${allOptional ? " = {}" : ""}` : ""}) {
    const url = new URL(${urlExpr}, this.baseUrl);
${hasQuery ? `    const queryParams = new URLSearchParams();
${queryVars.map(qv => `    if (params.${qv.name} !== undefined) queryParams.append("${qv.name}", String(params.${qv.name}));`).join("\n")}
    url.search = queryParams.toString();` : ""}
    const response = await fetch(url.toString(), {
      method: "${method.toUpperCase()}",
      headers: { "Content-Type": "application/json", ...this.headers },
${bodyType ? `      body: JSON.stringify(params.body),` : ""}
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(\`HTTP \${response.status}: \${error}\`);
    }
${returnType === "void" ? `    return;` : `    return response.json();`}
  }`);
    }
  }

  return `// @ts-check
/// <reference lib="dom" />
/* eslint-disable */
// Generated by openapi-fetch-client-gen. Do not edit by hand.

${typedefs}

export class ApiClient {
  /**
   * @param {string} baseUrl
   * @param {Record<string, string>} [headers]
   */
  constructor(baseUrl, headers = {}) {
    this.baseUrl = baseUrl.replace(/\\/?$/, "/");
    this.headers = { ...headers };
  }

  /**
   * @param {Record<string, string>} headers
   */
  updateHeaders(headers) {
    this.headers = { ...this.headers, ...headers };
  }

  /**
   * @param {string} name
   * @param {string} value
   */
  setHeader(name, value) {
    this.headers[name] = value;
  }
${classMethods.join("\n")}
}
`;
}

// CLI
const inputPath = process.argv[2];
const outputPath = process.argv[3] || "client.mjs";

/**
 * @param {string} value
 * @returns {boolean}
 */
function isHttpUrl(value) {
  return value.startsWith("http://") || value.startsWith("https://");
}

/**
 * @param {string} input
 * @returns {Promise<any>}
 */
async function loadOpenApiSpec(input) {
  if (isHttpUrl(input)) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${input}: HTTP ${response.status}`);
    }
    return response.json();
  }

  return JSON.parse(fs.readFileSync(path.resolve(input), "utf-8"));
}

if (inputPath === "--help" || inputPath === "-h") {
  console.log(`Usage: openapi-fetch-client-gen <openapi.json|url> [output.mjs]

Generate a JSDoc-typed fetch client from an OpenAPI spec.

Arguments:
  openapi.json|url  Path or URL to the OpenAPI JSON specification
  output.mjs        Output file path (default: client.mjs)`);
  process.exit(0);
}

if (inputPath === "--version" || inputPath === "-v") {
  const packageJson = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
  console.log(packageJson.version);
  process.exit(0);
}

if (!inputPath) {
  console.error("Usage: openapi-fetch-client-gen <openapi.json|url> [output.mjs]");
  process.exit(1);
}

try {
  const spec = await loadOpenApiSpec(inputPath);
  const clientCode = generateClient(spec);
  fs.writeFileSync(path.resolve(outputPath), clientCode);
  console.log(`Generated ${outputPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
