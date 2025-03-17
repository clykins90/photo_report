# Photo Report App - Migration Plan

This document outlines the steps to clean up duplicate pages and integrate the new UI components into our refactored frontend.

## Duplicate Pages to Resolve

We have several pairs of duplicate pages that need to be consolidated:

| Keep | Remove | Description |
|------|--------|-------------|
| `Dashboard.jsx` | ✅ `DashboardPage.jsx` | Main reports listing page |
| `ReportViewer.jsx` | ✅ `ReportDetailPage.jsx` | Page to view a single report |
| `ReportBuilder.jsx` | ✅ `CreateReportPage.jsx` & ✅ `EditReportPage.jsx` | Report creation/editing wizard |

## UI Component Migration

We're standardizing on the components in the `/components/ui/` directory:

| Component | Status | Notes |
|-----------|--------|-------|
| `button.jsx` | ✅ Ready | Imported from `/components/ui/` |
| `card.jsx` | ✅ Ready | Imported from `/components/ui/` |
| `input.jsx` | ✅ Ready | Imported from `/components/ui/` |
| `spinner.jsx` | ✅ Ready | Moved from `/components/common/` to `/components/ui/` |
| Other UI components | ✅ Review completed | No additional components needed at this time |

## Migration Steps

### 1. Consolidate UI Components

- [x] Create modernized spinner component in `/components/ui/`
- [x] Update imports across the codebase to use components from `/components/ui/`
- [x] Remove duplicate components from `/components/common/`

### 2. Clean Up Dashboard Page

- [x] Update Dashboard.jsx to use new UI components
- [x] Ensure Dashboard.jsx includes all features from DashboardPage.jsx:
  - [x] Report filtering
  - [x] Report deletion functionality
  - [x] Status badges for reports
  - [x] Refresh functionality
- [x] Update App.jsx routes to use Dashboard.jsx exclusively
- [x] Remove DashboardPage.jsx once migration is complete

### 3. Clean Up Report Viewer

- [x] Update ReportViewer.jsx to use new UI components
- [x] Ensure ReportViewer.jsx includes all features from ReportDetailPage.jsx
- [x] Update App.jsx routes to use ReportViewer.jsx exclusively
- [x] Remove ReportDetailPage.jsx once migration is complete

### 4. Clean Up Report Builder

- [x] Update ReportBuilder.jsx to use new UI components
- [x] Ensure ReportBuilder.jsx handles both creation and editing flows
- [x] Update App.jsx routes to use ReportBuilder.jsx exclusively
- [x] Remove CreateReportPage.jsx and EditReportPage.jsx once migration is complete

### 5. Final Cleanup

- [x] Remove `/components/common/` directory and its components
- [x] Update any remaining imports in the codebase
- [ ] Run thorough testing of all application flows
- [ ] Document the new component usage in README

## Implementation Strategy

To minimize risk during migration:

1. Work on one page type at a time
2. Complete all steps for that page type before moving to the next
3. Keep both versions temporarily in the routes file, commenting out the old version
4. Test thoroughly before removing old components

## Testing Checklist

- [x] Dashboard functionality
  - [x] Report listing
  - [x] Filtering and searching
  - [x] Creating new reports
  - [x] Deleting reports
  - [x] Status badges
  - [x] Data refresh
- [x] Report Builder functionality
  - [x] All three steps working (Basic Info, Photos & Analysis, Review)
  - [x] Saving drafts
  - [x] Submitting completed reports
  - [x] Edit mode working properly
- [x] Report Viewer functionality
  - [x] Displaying all report information correctly
  - [x] Photo display and analysis results
  - [x] PDF generation
  - [x] Edit functionality

## Next Steps

1. **Dashboard Page**: 
   - [x] Update the UI to use the new components ✓
   - [x] Add deletion functionality ✓
   - [x] Update App.jsx routes ✓
   - [x] Remove DashboardPage.jsx ✓

2. **ReportViewer Page**:
   - [x] Migrate to new UI components ✓
   - [x] Remove ReportDetailPage.jsx ✓
   - [x] Finalize testing

3. **ReportBuilder Page**:
   - [x] Update three-step wizard with new UI ✓
   - [x] Test creation and editing flows ✓
   - [x] Remove redundant CreateReportPage.jsx and EditReportPage.jsx ✓

4. **Component Cleanup**:
   - [x] Remove duplicate components from `/components/common/` ✓
   - [x] Check for any remaining imports of old components ✓
   - [ ] Document UI component usage for future development 