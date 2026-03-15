# Privacy Practices

## Single Purpose
This extension helps users discover emerging keywords on Google Trends by analyzing trend timelines and related queries, then displaying and exporting user-initiated results.

## Permission Justifications

### downloads
Used only when the user clicks Export to download JSON/TXT reports to the user’s local device.

### host permission (`*://trends.google.com/*`)
Required to open Google Trends pages and access Google Trends API responses needed for user-initiated keyword analysis.

### remote code
No remote code is executed. All executable code is packaged in the extension bundle.

### sidePanel
Used to provide the main extension UI (input, progress, results, and export actions).

### storage
Used to store runtime state, keyword queue, processed/effective keywords, and local task history on the user’s device.

### tabs
Used to create/update Google Trends tabs for the analysis workflow started by the user.

### webRequest
Used to detect Google Trends request completion and rate-limit responses (for example HTTP 429) required for a robust analysis flow.

## Data Usage (Chrome Web Store)
Recommended selections:
- Select: `Website content`
- Select: `User activity`
- Do not select (unless your implementation changes):
  - Personally identifiable information
  - Health information
  - Financial and payment information
  - Authentication information
  - Personal communications
  - Location
  - Web history

## Data Handling Statements
- Data is processed locally in the extension.
- No user data is sold.
- No user data is transferred to third parties.
- Data is used only for the extension’s single purpose.
- Users can delete local data by clearing extension data or uninstalling the extension.

## Certification Checklist
In Chrome Web Store Privacy practices, check all three required certification checkboxes:
1. No sale/transfer of user data to third parties outside approved use cases.
2. No use/transfer of user data for purposes unrelated to the extension’s single purpose.
3. No use/transfer of user data for creditworthiness or lending purposes.
