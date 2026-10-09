# Big B's BBQ Clean Pricing API v2.0

This is a clean rebuild of the pricing service.

## Approved retailers - strict
A result is accepted ONLY when its actual product URL belongs to one of these domains:

- walmart.com
- chefstore.com
- costco.com
- foodlion.com
- webstaurantstore.com

A seller name merely containing "Walmart" or another approved name is NOT enough.

## What each result returns

- canonical approved store
- product title
- retailer product description when accessible
- package description
- structured package quantity
- structured package unit
- normalized unit cost
- product form (fresh/frozen/canned/etc.) when stated
- retailer-detail-read flag
- source URL

## Costing safety

The backend never invents a package quantity.
If quantity/unit cannot be established, `package.confident` is false and the app must not calculate cost/person from that result.

## Vercel setup

Keep the existing Vercel environment variable:

SERPER_API_KEY

Upload these files to the GitHub repository already connected to Vercel.
