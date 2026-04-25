# openapi-fetch-client-gen

Generate a JSDoc-typed `fetch` client from an OpenAPI JSON specification.

## Install

```sh
npm install -g openapi-fetch-client-gen
```

## Usage

```sh
openapi-fetch-client-gen <openapi.json|url> [output.mjs]
```

If `output.mjs` is omitted, the client is written to `client.mjs` in the current directory.

## Example

```sh
openapi-fetch-client-gen ./openapi.json ./client.mjs
```

You can also generate from a URL:

```sh
openapi-fetch-client-gen https://api.example.com/openapi.json ./client.mjs
```

Then import the generated client:

```js
import { ApiClient } from "./client.mjs";

const client = new ApiClient("https://api.example.com");
```

## Requirements

Node.js 18 or newer.
