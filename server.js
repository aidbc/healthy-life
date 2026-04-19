const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";
const FOODS_DATA_SOURCE_ID =
  process.env.NOTION_FOODS_DATA_SOURCE_ID || "9cdb6069-72ec-4dc8-8d2b-e587c4ad66a4";
const NUTRIENTS_DATA_SOURCE_ID =
  process.env.NOTION_NUTRIENTS_DATA_SOURCE_ID || "9e0897ae-0074-4381-b7ca-d6fbecddf019";
const FOODS_DATABASE_ID =
  process.env.NOTION_FOODS_DATABASE_ID || "950a8267-6caa-45a4-b7f6-4f20047bd4d0";
const NUTRIENTS_DATABASE_ID =
  process.env.NOTION_NUTRIENTS_DATABASE_ID || "ed227d08-518e-4799-ad67-47e0eb6eeef2";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const cache = {
  data: null,
  expiresAt: 0,
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (requestUrl.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        configured: Boolean(process.env.NOTION_TOKEN),
      });
    }

    if (requestUrl.pathname === "/api/content") {
      const data = await getContent();
      return sendJson(res, 200, data);
    }

    return serveStaticFile(requestUrl.pathname, res);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return sendJson(res, statusCode, {
      ok: false,
      error: error.message || "Unknown server error",
      hint:
        statusCode === 500 && !process.env.NOTION_TOKEN
          ? "Add NOTION_TOKEN to your .env file and share both Notion databases with your integration."
          : undefined,
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Nutrition web is running at http://${HOST}:${PORT}`);
});

async function getContent() {
  if (cache.data && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  if (!process.env.NOTION_TOKEN) {
    const error = new Error("Missing NOTION_TOKEN. Copy .env.example to .env and add your Notion integration secret.");
    error.statusCode = 500;
    throw error;
  }

  const [foods, nutrients] = await Promise.all([
    queryAllRows(FOODS_DATA_SOURCE_ID),
    queryAllRows(NUTRIENTS_DATA_SOURCE_ID),
  ]);

  const normalizedNutrients = nutrients.map((row) => normalizeRow(row, "nutrient"));
  const nutrientIndex = new Map(
    normalizedNutrients.map((item) => [normalizeKey(item.name), item])
  );

  const normalizedFoods = foods.map((row) => {
    const item = normalizeRow(row, "food");
    item.nutrientNames = splitCsv(item.mainCompounds);
    item.nutrients = item.nutrientNames
      .map((name) => nutrientIndex.get(normalizeKey(name)))
      .filter(Boolean);
    return item;
  });

  const enrichedNutrients = normalizedNutrients.map((item) => {
    const foodsForNutrient = normalizedFoods.filter((food) =>
      food.nutrientNames.some((name) => normalizeKey(name) === normalizeKey(item.name))
    );

    return {
      ...item,
      foods: foodsForNutrient.map((food) => ({
        id: food.id,
        name: food.name,
        category: food.category,
      })),
    };
  });

  const payload = {
    ok: true,
    syncedAt: new Date().toISOString(),
    notion: {
      version: NOTION_VERSION,
      foodsDatabaseId: FOODS_DATABASE_ID,
      nutrientsDatabaseId: NUTRIENTS_DATABASE_ID,
      foodsDataSourceId: FOODS_DATA_SOURCE_ID,
      nutrientsDataSourceId: NUTRIENTS_DATA_SOURCE_ID,
    },
    foods: normalizedFoods,
    nutrients: enrichedNutrients,
  };

  cache.data = payload;
  cache.expiresAt = Date.now() + 60 * 1000;

  return payload;
}

async function queryAllRows(dataSourceId) {
  const results = [];
  let nextCursor;

  do {
    const body = {
      page_size: 100,
    };

    if (nextCursor) {
      body.start_cursor = nextCursor;
    }

    const response = await fetch(
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(
        data.message || `Notion request failed with status ${response.status}`
      );
      error.statusCode = response.status;
      throw error;
    }

    results.push(...data.results);
    nextCursor = data.has_more ? data.next_cursor : null;
  } while (nextCursor);

  return results;
}

function normalizeRow(row, kind) {
  const properties = row.properties || {};
  const normalized = {
    id: row.id,
    url: row.url,
    icon: row.icon?.emoji || null,
    cover: row.cover?.type === "external" ? row.cover.external.url : null,
    createdTime: row.created_time,
    updatedTime: row.last_edited_time,
  };

  for (const [name, property] of Object.entries(properties)) {
    normalized[toCamelCase(name)] = normalizePropertyValue(property);
  }

  if (kind === "food") {
    return {
      ...normalized,
      name: normalized.potravina || normalized.name || "Bez názvu",
      category: normalized.kategorie || "Nezařazeno",
      frequency: normalized.frekvenceTydne || "",
      benefit: normalized.vCemJeProspesna || "",
      note: normalized.poznamka || "",
      mainCompounds: normalized.hlavniLatky || "",
    };
  }

  return {
    ...normalized,
    name: normalized.latka || normalized.name || "Bez názvu",
    type: normalized.typ || "Nezařazeno",
    benefit: normalized.procJeProspesna || "",
    note: normalized.poznamka || "",
    foodSources: normalized.najdesHlavneV || "",
  };
}

function normalizePropertyValue(property) {
  switch (property.type) {
    case "title":
      return richTextToString(property.title);
    case "rich_text":
      return richTextToString(property.rich_text);
    case "select":
      return property.select?.name || "";
    case "multi_select":
      return property.multi_select.map((item) => item.name).join(", ");
    case "status":
      return property.status?.name || "";
    case "number":
      return property.number;
    case "checkbox":
      return property.checkbox;
    case "url":
      return property.url || "";
    case "email":
      return property.email || "";
    case "phone_number":
      return property.phone_number || "";
    case "date":
      return property.date?.start || "";
    case "people":
      return property.people.map((person) => person.name || person.id).join(", ");
    case "relation":
      return property.relation.map((item) => item.id).join(", ");
    case "formula":
      return normalizeFormula(property.formula);
    default:
      return "";
  }
}

function normalizeFormula(formula) {
  if (!formula) {
    return "";
  }

  switch (formula.type) {
    case "string":
      return formula.string || "";
    case "number":
      return formula.number;
    case "boolean":
      return formula.boolean;
    case "date":
      return formula.date?.start || "";
    default:
      return "";
  }
}

function richTextToString(parts) {
  return (parts || []).map((item) => item.plain_text).join("").trim();
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toCamelCase(input) {
  return String(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase());
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function serveStaticFile(requestPath, res) {
  const safePath = requestPath === "/" ? "/public/index.html" : `/public${requestPath}`;
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(path.join(__dirname, "public"))) {
    return sendText(res, 403, "Forbidden");
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      if (error.code === "ENOENT") {
        return sendText(res, 404, "Not found");
      }

      return sendText(res, 500, "Server error");
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(contents);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end(text);
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
