# Code Consolidation Plan - Next Steps

## What We've Accomplished

1. **Consolidated URL Functions**:
   - Combined `getBestPhotoUrl` and `getPhotoUrl` into a single function in `photoUtils.js`
   - All components now use the same URL resolution logic

2. **Unified File Utilities**:
   - Moved file manipulation utilities from `fileUtils.js` into `photoUtils.js`
   - Functions like `dataURLtoBlob` and `blobToDataURL` are now centralized

3. **Enhanced Photo Context**:
   - Integrated functionality from `usePhotoStorage` and `usePhotoUploadState`
   - Improved dependency arrays to prevent unnecessary re-renders
   - Added helper functions for common operations
   - Better error handling and state management

4. **Standardized Photo Object Structure**:
   - Consistent use of `PhotoSchema` 
   - Clearer property documentation
   - Better preservation of local data

5. **Reduced File Count**:
   - Deleted `fileUtils.js`
   - Deleted `usePhotoStorage.js`
   - Deleted `usePhotoUploadState.js`

## Next Steps

1. **Complete PhotoService Integration**:
   - Update remaining components that still import directly from `photoStorageManager.js`:
     - `PhotoUploadStep.jsx`
     - `AIAnalysisStep.jsx`
     - `ReportForm.jsx`
     - `PhotoUploader.jsx`

2. **Eliminate photoStorageManager**:
   - Move any remaining unique functionality to `photoUtils.js`
   - Update imports across the codebase
   - Delete the file

3. **Create a Consistent BlobURL Management API**:
   - Ensure blob URLs are always properly tracked and revoked
   - Standardize blob URL creation and cleanup

4. **Implement Performance Improvements**:
   - Analyze render performance of PhotoContext
   - Optimize dependency arrays and avoid unnecessary re-renders
   - Particularly focus on `analyzePhotos` function which depends on `photos` array

5. **Testing**:
   - Add tests for core photo utilities
   - Test blob URL lifecycle management
   - Verify data preservation across component boundaries

6. **Documentation**:
   - Document the photo object structure
   - Create clear examples of common operations
   - Add inline documentation for complex functions

## Implementation Priority

1. High Priority:
   - Fix `analyzePhotos` dependency on full `photos` array
   - Complete PhotoUploader component updates

2. Medium Priority:
   - Update remaining components
   - Delete `photoStorageManager.js`

3. Lower Priority:
   - Performance optimizations
   - Documentation improvements
   - Testing

## How to Proceed

For each component that still relies on `photoStorageManager`, update it to:
1. Import directly from `photoUtils.js` or
2. Use the updated `PhotoContext` functions

For components that need both approaches, prefer using the context where possible to reduce direct dependencies. 