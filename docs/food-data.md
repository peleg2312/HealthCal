# Bundled food data

The bundled reference list (`src/data/foods.ts`) holds 448 foods, available offline. Each food is `verified: true` exactly when it names the one record its values come from, and the record decides the line behind the food's "Reference" badge.

| Source | Field | Foods |
|---|---|---|
| USDA FoodData Central: SR Legacy 2018-04 and FNDDS survey foods 2024-10-31 | `fdcId` | 329 |
| Israel's national nutrition database (Tzameret), Ministry of Health, published on data.gov.il; foods updated October 2022 | `ilCode` (the record's `Code`) | 99 (48 of them recipes the Ministry computed, listed in `NATIONAL_RECIPES`; 10 packaged products' labels, in `NATIONAL_LABELS`) |
| Neither: estimates from a typical label or recipe | none | 20 |

Values are per 100 g; drinks too (the water screen converts ml with the first serving that names a volume).

## Carbohydrate

USDA stores total carbohydrate (by difference, fibre included). The national database stores available carbohydrate, without fibre. So a national food's `carbs` is the record's `carbohydrates` plus its `total_dietary_fiber`, and its `fiber` is that fibre. Where a record has no fibre value, it is used only when its energy equals 4P + 4C + 9F within 3% (no fibre was counted); its carbohydrate is then stored as given and `fiber` is left out. Energy is checked by each source's own convention: 4/4/9 (+7 for alcohol) for USDA, and 4P + 4(C - fibre) + 2 fibre + 9F for national foods.

kcal is whole, grams are to 0.1, sodium is whole mg, sugar is capped at carbohydrate. A value the record leaves empty is left out, never guessed. A value the record contradicts is not stored either: the one case is limonana (8835), whose sugar 0 sits beside 10.2 g of carbohydrate.

## Which record

- A national record is added only when the app has no row for the same food. A verified USDA row for the same food is kept (it gets search names in `src/data/searchNames.ts`). A national row may sit beside a USDA row only when it is a different product bought by a different label (cottage cheese 5%, milk 1%, the bakery pita).
- Only `makor` 3 (an Israeli product's label) or 4 (a recipe the Ministry computed). Never `makor` 1 or 6 (copies of USDA records: add the USDA record with its `fdcId` instead), never `makor` 2 (foreign products), never an `FFQ-` row.
- Where the database has one recipe in several oils, one row is used. A record whose Hebrew and English names disagree is never given a flavour either name contradicts (rugelach 2445 is plain "Rugelach").
- English names follow the list's style: noun first, qualifiers after a comma or in brackets, COOKED/DRY where it matters. A dish keeps its own name with a plain gloss ("Malawach, fried"). A packaged product is named by what it is, with the product's name in brackets ("Peanut puffs, corn-based (Bamba)"). A new name must not take the first result of an English search from an existing food: if it would, move the generic word out of the head of the name ("Tuna with mayonnaise (tuna salad)"). No name says where a food comes from.

## Servings (labels)

- Every serving of a national food is a unit of that food in the national unit table (`yehidot_mida_lemitzrachim`: food `mmitzrach`, unit `mida`, grams `mishkal`), at most four, never "100 g". Nothing is derived or kept from elsewhere; a food with no plausible household unit is not added.
- English labels by unit: 100 "1 piece" or the food's noun (pita, roll, bar...), 101 "1 mini ...", 102 "1 small ...", 103 "1 ..." (medium is the default), 104 "1 large ...", 200 "1 cup", 207 "1 cup grated", 300 "1 tbsp" up to 25 g else "1 serving spoon", 301 "1 level tbsp", 302 "1 heaped tbsp" up to 25 g else "1 heaped serving spoon", 400 "1 tsp", 500/502 "1 slice", 501 "1 thin slice", 503 "1 thick slice", 600 "1 tub" ("1 pot" for a dessert), 601 "1 mini tub", 602 "1 small tub", 800 "1 serving", 801 "1 small serving" ("1 small bowl" for soup), 802 "1 serving" ("1 bowl"), 803 "1 large serving", 903 "1 bag", 904 "1 carton", 905 "1 single pack", 906 "1 box" (or "1 tub"), 911 "1 small bag", 912 "1 large bag" (or "1 bag"), 1006 "1 small bowl", 1208 "1 finger". A new unit gets its label in `labelFits` in `scripts/ops/check-national-foods.mjs`.
- "tbsp" means a measuring spoon: 4 to 25 g; "tsp" 1 to 10 g. A national spoon heavier than 25 g is a "serving spoon".
- A drink names its volume in its first volume serving ("1 serving (140 ml)", "1 small cup (75 ml)", or "1 cup", read as 236.6 ml), and that serving weighs 0.90 to 1.15 g per ml.

## Adding a food

From USDA: find the record in the FNDDS survey release (or SR Legacy), add an `f(...)` row in its category's section with the record's values by the rules above and its `fdcId`, servings from the record's portions where one matches.

From the national database: get the tables (below), find the food's `Code`, check its `makor`, compute the values by the carbohydrate rule, pick at most four units from the unit table with the labels above, and add an `il(...)` row in its category's section with the code. Add the code to `NATIONAL_RECIPES` when `makor` is 4, and to `NATIONAL_LABELS` when it is a packaged product's label. Give the food its search names in `src/data/searchNames.ts`, on its own line in the order of `foods.ts`. Update the counts in the header of `foods.ts`, `scripts/check-foods.mjs` and `src/data/data-integrity.test.ts`. Then run every check below.

## Checks

```bash
node --experimental-strip-types scripts/check-foods.mjs     # every food: records, energy, spoons, drinks, counts
npx vitest run src/data                                      # the same as tests, plus the search names
node --experimental-strip-types scripts/ops/check-national-foods.mjs \
  --foods=<dir>/mitzrachim.json --units=<dir>/yehidot_mida_lemitzrachim.json \
  [--fndds=<dir>/FoodData_Central_survey_food_csv_2024-10-31]
```

`check-national-foods.mjs` is run by hand, not in CI, because the source tables are not in the repository. For every food with an `ilCode` it finds the record, refuses a `makor` other than 3 or 4 and an `FFQ-` row, recomputes every value (within 0.05 g, 0.5 kcal, 0.5 mg of the record), checks that every serving is a unit of that food at those grams with its label, checks the spoon and drink rules, and checks that `NATIONAL_RECIPES` is exactly the `makor` 4 codes and `NATIONAL_LABELS` holds only `makor` 3 codes. With `--fndds` it checks the seven foods added from FNDDS in November 2026 against `food_nutrient.csv`. It reads CSV or JSON. The date it last passed is in the header of `foods.ts`.

The national tables are on data.gov.il's CKAN API (`datastore_search`), resource ids: foods `c3cb0630-0650-46c1-a068-82d575c094b2`, units per food `755d28c0-75f7-40e1-9c8c-ecdd106f9b2d`, unit names `98fb46fe-e8de-4067-94d2-b0a8ea4269da`. Page through `https://data.gov.il/api/3/action/datastore_search?resource_id=<id>&limit=10000&offset=<n>` with a generic client name and a pause between requests, and save the result outside the repository. FNDDS: `https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip`.

## Licence

USDA FoodData Central is in the public domain. The national database is published on data.gov.il with the licence "Other (Open)" (its CKAN licence list marks it as approved open data). What is known of the terms comes from data.gov.il's FAQ as quoted in 2012: the data is open for free use without special approval, subject to the terms of use, and any application that uses it must clearly name the source. About names it ("Israel's national nutrition database (Tzameret), Ministry of Health, published on data.gov.il; foods updated October 2022"). Not known: the current text of the terms at https://data.gov.il/terms, which could not be opened from the machine this was written on; someone should read it in a browser before a release and record the result here. About a third of the database's rows are manufacturers' label figures; the dataset's licence covers it as published.
