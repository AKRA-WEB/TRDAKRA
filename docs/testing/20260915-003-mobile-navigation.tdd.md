# TDD Evidence: TRDAKRA Mobile Collapsible Navigation

## Source plan

- `C:/dev/WEBAPP/conductor/plans/20260915-003-trdakra-mobile-collapsible-navigation.md`
- Journeys were derived from the user's approved mobile navigation request.

## User journeys

- As a TRDAKRA employee, I want the mobile navigation to hide while I scroll down, so that it does not cover my work surface.
- As a TRDAKRA employee, I want to open all existing modules from one mobile menu, so that navigation remains available without a permanent horizontal strip.

## RED/GREEN evidence

| Stage | Command | Result | Guarantee |
| --- | --- | --- | --- |
| RED | `node tests/trdakra-mobile-navigation.test.js` on the pre-fix source | FAIL, exit 1: `initMobileNavigation is not a function` | The test exercised the intended missing controller behavior before implementation. |
| GREEN | `node tests/trdakra-mobile-navigation.test.js` on `505a447` | PASS, exit 0 | Scroll direction, topbar visibility, menu state, ARIA state, scroll lock and Escape close behavior execute successfully. |

## Test specification

| # | What is guaranteed | Test or procedure | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | Topbar stays visible at the top, hides after downward scroll and returns after upward scroll | `tests/trdakra-mobile-navigation.test.js` | isolated runtime | PASS |
| 2 | Opening/closing the mobile menu updates visible state, ARIA state and body scroll lock | `tests/trdakra-mobile-navigation.test.js` | isolated runtime | PASS |
| 3 | Escape closes an open mobile menu | `tests/trdakra-mobile-navigation.test.js` | isolated runtime | PASS |
| 4 | Existing TRDAKRA workflows, script compilation, version parity and data invariants remain valid | `tests/trdakra-comprehensive-qa.test.js`, `tests/trdakra-full-function-audit.test.js` and remaining TRDAKRA suites | integration/runtime | PASS |
| 5 | Mobile has one compact topbar, no module-strip layout participation or horizontal overflow; desktop keeps the module strip | Local browser at 390x844 and 1440x900 | browser | PASS |
| 6 | Mobile route selection closes the drawer and changes the rendered route | Local browser at 390x844, selected `ตรวจสต็อก` | browser | PASS |

## Coverage and known gaps

- The repository has no `package.json`, coverage configuration or `scripts/setup-package-manager.js`; the package-manager detector could not run because that helper is absent.
- No percentage coverage claim is made. The focused test executes every new controller branch used by the feature, while the browser run covers the rendered responsive behavior.
- Physical-device and authenticated production acceptance remain separate from this local candidate verification.
