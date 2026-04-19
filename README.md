# Notion Nutrition Web

Designovy a interaktivni web nad dvema Notion databazemi:

- `Nutricni doporuceni potravin`
- `Prehled prospesnych latek`

Frontend je cisty `HTML/CSS/JS`.
Backend je maly `Node.js` server bez zavislosti, ktery:

- bezpecne drzi Notion token mimo browser
- cte obe Notion data source
- vraci sjednocena JSON data do frontendu

## Proc je tam backend

Notion API token je tajny a podle Notion docs nema byt v klientskem JavaScriptu ani v repozitari.
Proto web nevola Notion API primo z prohlizece, ale pres serverovy endpoint `/api/content`.

Pouzite oficialni docs:

- [Authentication](https://developers.notion.com/reference/authentication)
- [Authorization](https://developers.notion.com/guides/get-started/authorization)
- [Query a data source](https://developers.notion.com/reference/query-a-data-source)
- [Retrieve a data source](https://developers.notion.com/reference/retrieve-a-data-source)
- [Best practices for handling API keys](https://developers.notion.com/docs/best-practices-for-handling-api-keys)

## Spusteni

1. Zkopiruj `.env.example` do `.env`
2. Vloz svuj `NOTION_TOKEN`
3. Ujisti se, ze tvoje Notion integrace ma pristup k obema databazim
4. Spust:

```bash
npm start
```

5. Otevri:

```text
http://localhost:3000
```

## Jak pripojit Notion databazi

1. V Notion vytvor interni integraci
2. Zkopiruj integration secret do `.env`
3. Na obou databazich dej `Add connections` a pridej svoji integraci
4. Pokud pouzijes jine databaze, uprav:

- `NOTION_FOODS_DATABASE_ID`
- `NOTION_FOODS_DATA_SOURCE_ID`
- `NOTION_NUTRIENTS_DATABASE_ID`
- `NOTION_NUTRIENTS_DATA_SOURCE_ID`

## Soubory

- `server.js` - API proxy a static server
- `public/index.html` - struktura aplikace
- `public/styles.css` - vizualni styl
- `public/app.js` - interaktivita, filtry, render
