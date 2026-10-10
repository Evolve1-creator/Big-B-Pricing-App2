# Big B's Direct Store Pricing API v2.2

This is a clean direct-retailer version.

## No Google / Serper

The backend does not use Google Shopping or Serper.

It searches these retailer websites directly:

- CHEF'STORE
- Costco
- Food Lion

WebstaurantStore has been removed.

## Important retailer limitation

Retailer websites can block automated requests, require JavaScript, require a selected
store/location, or hide prices until a location/member session is established.

When that happens, this API reports that retailer as unavailable for that search.
It does not substitute sellers from Google or another marketplace.

## Package and costing data

When the retailer provides enough information, the service returns:

- retailer
- product title
- retailer description
- price
- package quantity/unit
- selling unit
- normalized unit cost
- product form
- retailer page link

The Catering Business Manager calculates Big B's cost per person using the saved
serving quantity and cooked yield.


## v2.2 fixes

- Honors the `preferredStores` array sent by the Catering Business Manager.
- Only Costco, CHEF'STORE, and Food Lion are configured.
- Returns flattened fields expected by the front end: `totalQuantity`, `totalUnit`, `unitCost`, `unitCostUnit`, `costingReady`, and `costingReason`.
- Expanded package parsing for multipacks, count packs, pounds, ounces, fluid ounces, gallons, quarts, bags, boxes, cans, bottles, jugs, cartons, and foodservice pack notation.
- Preserves package descriptions such as `6 x #10 cans` without inventing a weight that is not stated by the retailer.
