const express = require('express');
const { check } = require('express-validator');
const { 
  createReport, 
  getReports, 
  getReport, 
  updateReport, 
  deleteReport, 
  addPhotos,
  generatePdf,
  generateShareLink,
  getSharedReport,
  revokeShareLink,
  generateSummary
} = require('../controllers/reportController');
const { protect } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/tempUpload');

const router = express.Router();

// Public routes
router.get('/shared/:token', getSharedReport);

// Protected routes
router.route('/')
  .post(protect, createReport)
  .get(protect, getReports);

router.route('/:id')
  .get(protect, getReport)
  .put(protect, updateReport)
  .delete(protect, deleteReport);

// @route   POST /api/reports/:id/photos
// @desc    Add photos to report
// @access  Private
router.post('/:id/photos', uploadMultiple('photos', 20), addPhotos);

// @route   POST /api/reports/:id/generate-pdf
// @desc    Generate a PDF for a report
// @access  Private
router.post('/:id/generate-pdf', protect, generatePdf);

// Sharing routes
router.post('/:id/share', protect, generateShareLink);
router.delete('/:id/share', protect, revokeShareLink);

// Generate summary from photo analyses
router.post('/generate-summary', protect, generateSummary);

// PDF generation
router.get('/:reportId/pdf', generatePdf);

module.exports = router; 