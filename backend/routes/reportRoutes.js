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
  generateSummary
} = require('../controllers/reportController');
const { protect } = require('../middleware/auth');
const { uploadMany } = require('../middleware/uploadMiddleware');

const router = express.Router();

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
router.post('/:id/photos', uploadMany('photos', 20), addPhotos);

// @route   POST /api/reports/:id/generate-pdf
// @desc    Generate a PDF for a report
// @access  Private
router.post('/:id/generate-pdf', protect, generatePdf);

// Generate summary from photo analyses
router.post('/generate-summary', protect, generateSummary);

// PDF generation
router.get('/:reportId/pdf', generatePdf);

module.exports = router; 