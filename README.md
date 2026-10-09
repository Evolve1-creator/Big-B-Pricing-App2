# Big B's BBQ Pricing App - Vercel Package v1.4

Package detection now uses all available product text:
- title
- description/snippet
- delivery/extra text
- price/selling-unit wording

Examples:
- Title: Chicken Breast Fillet
  Description: 10 lb case
  -> 10 lb case

- Title: Boneless Chicken Breast Portions
  Description: 40 pieces, 4 oz each
  -> 40 x 4 oz pieces

- Price: $2.49/lb
  -> Sold by the pound

Keep SERPER_API_KEY only in Vercel Environment Variables.
