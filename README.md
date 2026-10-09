# Big B's Direct Store Pricing API v2.1

This is a clean direct-retailer version.

## No Google / Serper

The backend does not use Google Shopping or Serper.

It searches these retailer websites directly:

- Walmart
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
