# analyze-food-lab: a temporary measuring route

**Temporary.** This route exists only while a measuring round of the AI food estimate runs, and is removed at the end of it (`lab.mjs remove`, below). It is never part of the app and is not deployed by `scripts/ops/provision-supabase.mjs`.

## What it is

The measuring script (`scripts/ops/eval-food-ai.mjs`) runs the analyze function's own code (`supabase/functions/analyze-food/analyze.ts`) on this machine, with test meals and photos, and needs to reach the model. When there is no model key on the machine, it sends each request through this route instead: a Supabase edge function on the project's own backend that forwards one Messages API request with the project's existing `ANTHROPIC_API_KEY` and returns the model's own response, so usage and cache tokens are visible to the script, which prices them and keeps the money ledger.

The route answers only:

- before `LAB_UNTIL` (an ISO time, a secret of the function; unset or past means closed, 410). `lab.mjs deploy` sets it at most six hours ahead;
- to a signed-in caller whose Supabase user id is exactly `LAB_USER_ID`, the one throwaway test account. The function's own check is the gate: it asks Supabase Auth for the token's user (`getUser`) and compares the id (`labCaller`). `verify_jwt: true` stays on, but on this project the platform only turns away a missing or malformed token; a request with the `apikey` header alone reaches the function and is refused there ("sign in"). Do not count `verify_jwt` as a second layer;
- for a request that is what the analyze code sends (`function/lab.ts`): one of `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`; `max_tokens` up to 3000; at most 60,000 characters of text (system, messages and the JSON schema together; the analyze code sends about 6,000) and at most 2 images, so one request's input stays under about 10 cents even on Opus; only the fields `model`, `max_tokens`, `system`, `messages`, `output_config` (effort and a JSON schema), `thinking`, and the careful pass's `betas: ["server-side-fallback-2026-07-01"]` with `fallbacks: "default"`; text and base64 images only. Tools, streaming, other betas and unknown fields are refused before the model is reached.

It never logs a request body (only model, token counts, status and time), has no allowance of its own and does not touch the production functions (`analyze-food`, `food-search`), their secrets or their limits.

## What it measured (18 November 2026)

The round that built this route measured the quick photo pass at about 40% mean error on meals of 150 kcal or more, reading high (median +24%), and adopted a stepwise guide for it that brought that to about 31% (-9 points [-13, -5], confirmed side by side), plus a fix for drinks and a wider photo range. The figures, what they do and do not show, and what was tried and not adopted are in the main README, "How close it gets". Rows and analysis scripts were kept outside the repository; the ledger closed at $2.47 of the $2.50 working limit.

## Files

- `function/index.ts`: the edge function (Deno). `function/lab.ts`: its checks, pure. `function/deno.json`: import map.
- `function/lab.test.ts`: the refusals, without the network: `node --experimental-transform-types --test scripts/ops/food-ai-lab/function/lab.test.ts`.
- `lab.mjs`: create the test account, deploy, check, probe, remove. `lab-round.test.mjs`: its closing-time rule.

## Use

Like `provision-supabase.mjs`, `lab.mjs` reaches Supabase's management API with `SUPABASE_ACCESS_TOKEN`, or, where a proxy adds the real token, with a placeholder (run it with `NODE_USE_ENV_PROXY=1`). The project is the one `eas.json`'s production build points at, or `--ref=<project ref>`. The account file must live outside the repository; it holds the throwaway account's email and password (mode 600) and nothing else. No secret is written anywhere else.

```bash
A=/path/outside/the/repo/.account
NODE_USE_ENV_PROXY=1 node scripts/ops/food-ai-lab/lab.mjs account --account=$A   # one confirmed throwaway account
NODE_USE_ENV_PROXY=1 node scripts/ops/food-ai-lab/lab.mjs deploy --account=$A --hours=6
NODE_USE_ENV_PROXY=1 node scripts/ops/food-ai-lab/lab.mjs probe --account=$A     # free: every probe must be refused
NODE_USE_ENV_PROXY=1 node scripts/ops/food-ai-lab/lab.mjs status --account=$A
```

Then measure (every request is priced from its usage and written to the ledger before the next one; the script refuses to send once the ledger reaches its limit, and stops a run whose first ten requests cost more than twice `--expect`):

```bash
NODE_USE_ENV_PROXY=1 node --experimental-transform-types scripts/ops/eval-food-ai.mjs \
  --via=lab --account=$A --ledger=<ledger.json> --limit=2.5 --expect=0.0003 --run=<label> \
  --photos=<dir> --photo-cases=<dir>/cases-repaired.json --typed=<a.json>,<b.json> \
  --configs=current --trials=2 --rows=<rows.jsonl>
node --experimental-transform-types scripts/ops/eval-food-ai.mjs --report=<rows.jsonl> --compare=current,precise --breakdown
```

## Remove it

At the end of the round, always:

```bash
NODE_USE_ENV_PROXY=1 node scripts/ops/food-ai-lab/lab.mjs remove --account=$A
NODE_USE_ENV_PROXY=1 node scripts/ops/food-ai-lab/lab.mjs status --account=$A
```

`remove` deletes the function, its two secrets (`LAB_USER_ID`, `LAB_UNTIL`) and the test account, and replaces the account file with a receipt (the user id and the time, no email or password). It refuses to run without `--account`, so the account cannot be left behind by mistake (`--keep-account` removes only the function and secrets, on purpose). `status --account` must then say `analyze-food-lab: absent`, `lab secrets present: none` and `test account <id>: absent`. If the round ends without `remove`, the route still closes itself at `LAB_UNTIL`, but the function and the account stay until removed.

The six hours are per round, not per deploy: the first `deploy` writes its closing time into the account file, and a later `deploy` (a fix to the function) keeps that time; a closed round is not reopened, and a removed round's receipt cannot be deployed again. The rule is `roundUntil`, tested in `lab-round.test.mjs` (`node --test scripts/ops/food-ai-lab/lab-round.test.mjs`).

The round of 18 November 2026 was removed this way at 09:40 UTC, before its six hours were up, once the input-size cap above had been written and no more measuring was needed (the deployed copy predated the cap).
