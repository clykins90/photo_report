/**
 * PDF utilities module for PDF generation
 * Handles common PDF utilities like styling, headers, footers, etc.
 */
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const User = require('../../models/User');

/**
 * Get styling configuration for the PDF
 * @param {Object} report - The report data
 * @returns {Object} Styling configuration including fonts, colors, and company info
 */
const getStyleConfig = async (report) => {
  // Register default fonts
  // Using standard fonts that come with PDFKit as fallbacks
  // Helvetica is the default font in PDFKit
  const fonts = {
    // These are standard fonts built into PDFKit
    Heading: 'Helvetica-Bold',
    Body: 'Helvetica',
    Italic: 'Helvetica-Oblique'
  };
  
  // Define colors for consistent branding
  let colors = {
    primary: '#3B82F6', // Default blue
    secondary: '#1E3A8A',
    text: '#111827',
    lightText: '#6B7280',
    accent: '#EF4444',
    background: '#FFFFFF',
    lightGray: '#F3F4F6',
    light: '#F9FAFB'   // Very light gray for backgrounds
  };
  
  // Try to get company info from the user
  let companyInfo = null;
  let companyLogo = null;
  
  try {
    if (report.user) {
      const user = await User.findById(report.user);
      if (user && user.company) {
        companyInfo = user.company;
        
        // Try to load company logo if available
        if (user.company.logoPath) {
          const logoPath = path.join(process.cwd(), user.company.logoPath);
          if (fs.existsSync(logoPath)) {
            companyLogo = logoPath;
          }
        }
        
        // Use company branding colors if available
        if (user.company.branding) {
          if (user.company.branding.primaryColor) {
            colors.primary = user.company.branding.primaryColor;
          }
          if (user.company.branding.secondaryColor) {
            colors.secondary = user.company.branding.secondaryColor;
          }
        }
      }
    }
  } catch (err) {
    logger.warn(`Could not fetch company info: ${err.message}`);
  }
  
  return { fonts, colors, companyInfo, companyLogo };
};

/**
 * Add consistent page header
 * @param {Object} doc - The PDFKit document
 * @param {String} title - The page title
 * @param {Object} colors - Color scheme
 * @param {Object} fonts - Font configuration
 * @param {Number} pageNumber - The page number
 */
const addPageHeader = (doc, title, colors, fonts, pageNumber) => {
  // Draw header bar
  doc.rect(0, 0, doc.page.width, 50).fill(colors.primary);
  
  // Add title
  doc.fillColor('#FFFFFF').fontSize(14).font(fonts.Heading);
  doc.text(title, 50, 20);
  
  // Add page number at the top right
  doc.fillColor('#FFFFFF').fontSize(11).font(fonts.Body);
  doc.text(`Page ${pageNumber}`, doc.page.width - 100, 20, { width: 50, align: 'right' });
};

/**
 * Add footers to all pages
 * @param {Object} doc - The PDFKit document
 * @param {String} reportId - The report ID
 * @param {Object} colors - Color scheme
 * @param {Object} fonts - Font configuration
 */
const addFooters = (doc, reportId, colors, fonts) => {
  const totalPages = doc.bufferedPageCount;
  
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    
    // Skip adding footer to cover page (page 0)
    if (i === 0) continue;
    
    // Add a line at the bottom of the page
    const footerY = doc.page.height - 50;
    doc.moveTo(50, footerY).lineTo(doc.page.width - 50, footerY).stroke(colors.lightText);
    
    // Add report ID and timestamp
    doc.fontSize(8).font(fonts.Body).fillColor(colors.secondary);
    doc.text(
      `Report ID: ${reportId} | Generated: ${new Date().toLocaleDateString()}`,
      50, 
      footerY + 10, 
      { align: 'left', width: doc.page.width - 100 }
    );
    
    // Add copyright and page count
    doc.text(
      `© PhotoReportApp. All rights reserved. | Page ${i} of ${totalPages - 1}`,
      50, 
      footerY + 20,
      { align: 'left', width: doc.page.width - 100 }
    );
  }
  
  logger.info(`Added footers to ${totalPages - 1} pages`);
};

module.exports = {
  getStyleConfig,
  addPageHeader,
  addFooters
}; 