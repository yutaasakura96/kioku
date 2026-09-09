<script setup lang="ts">
// `noScripts: true` — the rule is in `nuxt.config.ts` and the assertion is in
// `test/e2e/no-scripts.test.ts`.
//
// ⚠️ **No sign-in button, no retry, no support link — and no link of any kind,
// including a logo that happens to be one** (`08` §2.1, `10` §9.2). `S1` says
// there is no path to create an account from inside the app, and the refusal
// page is inside the app. The reader gets back to the door by typing the URL
// (`09` §4.1), and that is the decision rather than an oversight.
//
// ⚠️ **There is no rule under the body, and the absent rule is the
// specification.** In the empty-state block the rule separates the statement
// from what the state *offers* (`05` §7). This state offers nothing, so a rule
// would draw a line and then point at empty ground — which reads as a component
// that failed to load, on the one screen in the application where a dead end is
// the feature.
//
// ⚠️ The refusal is not remembered. No row is written, so there is no rate-limit
// state and no audit trail here to render (`08` §2.1).
</script>

<template>
  <main>
    <!-- `10` §9.2 gives this sentence exactly. -->
    <h1>This account is not invited.</h1>
    <p>Kioku admits one account.</p>
  </main>
</template>
