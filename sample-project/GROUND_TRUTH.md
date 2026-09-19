# Demo Ground Truth: Intentional Defects

This file is used to evaluate the review system. These defects are intentional and isolated to `sample-project`.

| ID | File / Area | Intentional defect | Category | Severity | Expected detector |
|---|---|---|---|---|---|
| GT-01 | `src/orders/orders.controller.ts` request handling | Controller accepts `userId` from the request body instead of deriving identity from an authenticated principal. | SECURITY | HIGH | Code Review Agent |
| GT-02 | `src/orders/create-order.dto.ts`, `src/main.ts` | DTO lacks `class-validator` decorators and the app does not configure a validation pipe. | VALIDATION | HIGH | Code Review Agent |
| GT-03 | `src/orders/orders.service.ts` quantity validation | Zero quantity is allowed because only `< 0` is rejected. | BUG | MEDIUM | Code Review Agent |
| GT-04 | `src/orders/orders.service.ts` restricted products | Restricted enterprise products are not checked against allowed users or authorization context. | SECURITY | HIGH | Code Review Agent |
| GT-05 | `src/orders/orders.controller.ts:11` | Sensitive-looking token/password context is written through `console.log`. | SECURITY | MEDIUM | ESLint, Code Review Agent |
| GT-06 | `src/orders/orders.service.ts:55-59` | `findOrdersForUser` swallows errors and returns an empty list, hiding real failures. | ERROR_HANDLING | MEDIUM | Code Review Agent, ESLint unused catch variable |
| GT-07 | `src/orders/orders.service.ts:62-69` | `summarizeOrders` awaits sequentially in a loop, which is inefficient for many users. | PERFORMANCE | LOW | Code Review Agent |
| GT-08 | `src/orders/orders.service.ts:71-80` | Coupon logic is duplicated and no-coupon orders are calculated as zero total. | BUG | HIGH | Jest, Code Review Agent |
| GT-09 | `src/orders/orders.service.spec.ts` | Missing edge-case tests for zero quantity, restricted products, no-coupon totals, and unauthorized user access. | TESTING | MEDIUM | Code Review Agent |
| GT-10 | `package-lock.json` sample dependency tree | Deliberately old demo dependencies create real `npm audit` findings in current npm metadata. | SECURITY | HIGH | Security audit |

## Deterministic Checks Expected In Demo

- TypeScript: expected to pass with `0 compilation errors`.
- ESLint: expected to fail because of `no-console` and the unused `_error` catch binding.
- Jest: expected to fail `OrdersService creates an order for a valid customer` because total is `0` instead of `20`.
- Coverage: expected to be calculated from real Jest coverage output.
- Dependency audit: expected to report live npm audit metadata. On the current demo lockfile this reports `0 critical | 3 high | 5 moderate | 1 low`.

The Code Review Agent should add contextual findings that deterministic tools do not reliably infer, especially authorization, validation, swallowed errors, performance, and missing tests.
