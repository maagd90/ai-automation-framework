# Excel / XLSX Test Case Format

> **Excel upload support is planned for Phase 2.**  
> Until then, please use the JSON, TXT, or Feature formats — all of which are fully supported today.

---

## Expected Column Layout

When Excel upload is available, your spreadsheet should contain the following columns (order matters):

| Column | Header | Required | Example Value |
|--------|--------|----------|---------------|
| A | Test Case ID | ✅ | TC-001 |
| B | Test Case Name | ✅ | Login with valid credentials |
| C | Step No | ✅ | 1 |
| D | Action | ✅ | enter |
| E | Target | ✅ | Username field |
| F | Test Data | ❌ | standard_user |
| G | Expected Result | ❌ | Products page should be visible |
| H | Priority | ❌ | high |
| I | Module | ❌ | Authentication |
| J | Feature | ❌ | Login |

---

## Sample Row Data

| Test Case ID | Test Case Name | Step No | Action | Target | Test Data | Expected Result | Priority | Module | Feature |
|---|---|---|---|---|---|---|---|---|---|
| TC-001 | Login with valid credentials | 1 | navigate | https://www.saucedemo.com | | | high | Auth | Login |
| TC-001 | Login with valid credentials | 2 | enter | Username field | standard_user | | high | Auth | Login |
| TC-001 | Login with valid credentials | 3 | enter | Password field | secret_sauce | | high | Auth | Login |
| TC-001 | Login with valid credentials | 4 | click | Login button | | | high | Auth | Login |
| TC-001 | Login with valid credentials | 5 | verifyVisible | Products page | | Products page should be visible | high | Auth | Login |

> **Note:** Rows for the same test case share the same Test Case ID. The system groups rows by Test Case ID to reconstruct multi-step test cases.

---

## Currently Supported Formats

Use one of these formats today:

| Format | File Extension | Best For |
|--------|---------------|----------|
| JSON | `.json` | Structured data, best AI accuracy |
| Plain Text | `.txt` | Manual QA teams, quick entry |
| Gherkin/BDD | `.feature` | BDD teams using Given/When/Then |
| Excel | `.xlsx` | ⏳ Coming in Phase 2 |

See [`sample-testcases.json`](./sample-testcases.json), [`sample-testcases.txt`](./sample-testcases.txt), and [`sample-testcases.feature`](./sample-testcases.feature) for working examples you can upload right now.
