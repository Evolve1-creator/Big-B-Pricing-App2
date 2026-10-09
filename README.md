# Big B's BBQ Pricing App - GitHub/Vercel Package

Upload the CONTENTS of this folder to the root of the GitHub repository connected to Vercel.

Repository structure:

```text
api/
  health.js
  prices.js
index.html
package.json
vercel.json
.gitignore
.env.example
README.md
```

## Vercel Environment Variable

In Vercel:

Settings -> Environment Variables

Create:

```text
SERPER_API_KEY
```

Paste your Serper API key as the value.

Do not upload your real API key to GitHub.

## After uploading to GitHub

Vercel should redeploy automatically.

Test the homepage:

```text
https://YOUR-PROJECT.vercel.app
```

Then test:

```text
https://YOUR-PROJECT.vercel.app/api/health
```

You should receive JSON with:

```json
{
  "ok": true,
  "service": "Big B's BBQ Pricing API"
}
```

## Pricing endpoint

The Catering Business Manager will eventually send pricing requests to:

```text
POST https://YOUR-PROJECT.vercel.app/api/prices
```

Example request:

```json
{
  "location": "South Carolina, United States",
  "preferredStores": ["Sam's Club", "Walmart", "CHEF'STORE", "Costco"],
  "items": [
    {
      "id": 1,
      "name": "Pork Belly Burnt Ends",
      "searchIngredient": "Pork belly"
    }
  ]
}
```
