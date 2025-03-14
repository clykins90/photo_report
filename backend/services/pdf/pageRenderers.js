/**
 * Page renderers module for PDF generation
 * Handles rendering different types of PDF pages
 */
const logger = require('../../utils/logger');
const photoHandler = require('./photoHandler');
const pdfUtils = require('./pdfUtils');

/**
 * Render a page based on its type
 * @param {Object} doc - The PDFKit document
 * @param {Object} page - The page object with type and content
 * @param {Object} colors - Color scheme
 * @param {Object} fonts - Font configuration
 * @param {Number} pageNumber - The page number
 * @param {Object} companyInfo - Company information
 * @param {String} companyLogo - Path to company logo
 * @returns {Promise} Promise that resolves when the page is rendered
 */
const renderPage = async (doc, page, colors, fonts, pageNumber, companyInfo, companyLogo) => {
  switch (page.type) {
    case 'cover':
      await renderCoverPage(doc, page.content.report, companyInfo, companyLogo, colors, fonts, pageNumber);
      break;
    case 'summary':
      renderSummaryPage(doc, page.content.report, colors, fonts, pageNumber);
      break;
    case 'damages':
      renderDamagesPage(doc, page.content.title, page.content.damages, colors, fonts, pageNumber);
      break;
    case 'recommendations':
      renderRecommendationsPage(doc, page.content.title, page.content.recommendations, colors, fonts, pageNumber);
      break;
    case 'materials':
      renderMaterialsPage(doc, page.content.title, page.content.materials, colors, fonts, pageNumber);
      break;
    case 'photo_large':
      await renderLargePhotoPage(doc, page.content.title, page.content.photo, colors, fonts, pageNumber);
      break;
    case 'photo_grid':
      await renderPhotoGridPage(doc, page.content.title, page.content.photos, colors, fonts, pageNumber);
      break;
    default:
      logger.warn(`Unknown page type: ${page.type}`);
      break;
  }
};

/**
 * Render a cover page
 * @param {Object} doc - The PDFKit document
 * @param {Object} report - The report data
 * @param {Object} companyInfo - Company information
 * @param {String} companyLogo - Path to company logo
 * @param {Object} colors - Color scheme
 * @param {Object} fonts - Font configuration
 * @param {Number} pageNumber - The page number
 * @returns {Promise} Promise that resolves when the page is rendered
 */
const renderCoverPage = async (doc, report, companyInfo, companyLogo, colors, fonts, pageNumber) => {
  // We don't show page numbers on the cover, so we don't use the pageNumber parameter
  
  // Draw header bar
  doc.rect(0, 0, doc.page.width, 120).fill(colors.primary);
  
  // Add logo if available
  if (companyLogo) {
    try {
      doc.image(companyLogo, 50, 30, { width: 150 });
    } catch (err) {
      logger.error(`Error adding company logo: ${err.message}`);
      // Continue without the logo
    }
  } else if (companyInfo && companyInfo.name) {
    doc.fillColor('#FFFFFF').fontSize(24).font(fonts.Heading);
    doc.text(companyInfo.name, 50, 50);
  }
  
  // Add report title
  const titleY = 180;
  doc.fillColor(colors.primary).fontSize(30).font(fonts.Heading);
  doc.text(report.title || 'Property Inspection Report', 50, titleY, { align: 'center' });
  
  // Add property image if available
  if (report.photos && report.photos.length > 0) {
    const mainPhoto = report.photos[0];
    
    // Draw the property image with a border
    const imageWidth = 300;
    const imageHeight = imageWidth * 0.75;
    const imageX = (doc.page.width - imageWidth) / 2;
    doc.rect(imageX - 5, titleY + 50 - 5, imageWidth + 10, imageHeight + 10).fill(colors.light);
    
    // Always use embedPhoto for consistency, regardless of photo source
    try {
      await photoHandler.embedPhoto(doc, mainPhoto, imageX, titleY + 50, imageWidth, imageHeight);
    } catch (err) {
      logger.error(`Error embedding cover photo: ${err.message}`);
      // Add a placeholder if the photo fails to load
      photoHandler.addMissingImagePlaceholder(doc, imageX, titleY + 50, imageWidth, imageHeight, "Cover Photo");
    }
  }
  
  // Client info box
  const boxY = doc.page.height - 200;
  doc.rect(50, boxY, doc.page.width - 100, 120).lineWidth(1).stroke(colors.primary);
  
  doc.fillColor(colors.primary).fontSize(14).font(fonts.Heading);
  doc.text('CLIENT INFORMATION', 70, boxY + 20);
  doc.fillColor(colors.text).fontSize(11).font(fonts.Body);
  
  let clientInfoY = boxY + 45;
  doc.text(`Client: ${report.clientName || 'N/A'}`, 70, clientInfoY);
  clientInfoY += 20;
  
  if (report.propertyAddress) {
    // Check if propertyAddress is an object with detailed structure
    if (typeof report.propertyAddress === 'object' && report.propertyAddress !== null) {
      const address = report.propertyAddress;
      // Build address string from components
      const addressStr = [
        address.street,
        address.city,
        address.state,
        address.zipCode,
        address.country
      ].filter(Boolean).join(', ');
      
      doc.text(`Property Address: ${addressStr || 'N/A'}`, 70, clientInfoY);
    } else {
      // Handle case where propertyAddress is a string
      doc.text(`Property Address: ${report.propertyAddress}`, 70, clientInfoY);
    }
    clientInfoY += 20;
  }
  
  doc.text(`Inspection Date: ${new Date(report.inspectionDate || Date.now()).toLocaleDateString()}`, 70, clientInfoY);
};

/**
 * Render a summary page
 * @param {Object} doc - The PDFKit document
 * @param {Object} report - The report data
 * @param {Object} colors - Color scheme
 * @param {Object} fonts - Font configuration
 * @param {Number} pageNumber - The page number
 */
const renderSummaryPage = (doc, report, colors, fonts, pageNumber) => {
  // Page header
  pdfUtils.addPageHeader(doc, 'Report Summary', colors, fonts, pageNumber);
  
  // Summary content
  if (report.summary) {
    doc.fillColor(colors.primary).fontSize(14).font(fonts.Heading);
    doc.text('Overview', 50, 80);
    
    doc.fillColor(colors.text).fontSize(11).font(fonts.Body);
    doc.text(report.summary, 50, 105, {
      width: doc.page.width - 100,
      align: 'left'
    });
  }
  
  // Add a key findings box if damages exist
  if (report.damages && report.damages.length > 0) {
    const yPosition = report.summary ? 200 : 80;
    doc.y = yPosition;
    
    // Key findings box header
    doc.rect(50, doc.y, doc.page.width - 100, 30).fill(colors.primary);
    doc.fillColor('#FFFFFF').fontSize(14).font(fonts.Heading);
    doc.text('KEY FINDINGS', 70, doc.y - 25);
    
    // Key findings content
    doc.rect(50, doc.y + 5, doc.page.width - 100, 
             Math.min(report.damages.length * 25 + 20, 150)).fill(colors.light);
    
    let yPos = doc.y + 15;
    doc.fillColor(colors.text).fontSize(11).font(fonts.Body);
    
    report.damages.slice(0, 5).forEach((damage, index) => {
      // Add bullet point
      doc.circle(65, yPos + 5, 3).fill(colors.accent);
      
      // Add damage description
      const damageText = damage.type 
        ? `${damage.type} (${damage.severity || 'unknown severity'})` 
        : (typeof damage === 'string' ? damage : 'Damage detected');
      
      doc.text(damageText, 75, yPos, {
        width: doc.page.width - 130,
        ellipsis: true
      });
      
      yPos += 25;
    });
  }
};

/**
 * Render a damages page
 * @param {Object} doc - The PDFKit document
 * @param {String} title - The page title
 * @param {Array} damages - Array of damage objects
 * @param {Object} colors - Color scheme
 * @param {Object} fonts - Font configuration
 * @param {Number} pageNumber - The page number
 */
const renderDamagesPage = (doc, title, damages, colors, fonts, pageNumber) => {
  // Page header
  pdfUtils.addPageHeader(doc, title, colors, fonts, pageNumber);
  
  damages.forEach((damage, index) => {
    const yStart = 80 + (index * 220);
    
    // Draw a light background for each damage entry
    doc.rect(50, yStart, doc.page.width - 100, 200)
      .fillAndStroke(colors.lightGray, colors.lightText);
    
    // Damage header
    doc.fillColor(colors.primary).fontSize(14).font(fonts.Heading)
      .text(damage.title || `Damage ${index + 1}`, 60, yStart + 10);
    
    // Damage description
    doc.fillColor(colors.text).fontSize(11).font(fonts.Body)
      .text(damage.description || 'No description provided', 60, yStart + 35, { 
        width: doc.page.width - 120,
        height: 60,
        ellipsis: true
      });
    
    // Add affected areas if available
    if (damage.affectedAreas) {
      doc.fillColor(colors.primary).font(fonts.Heading).text('Affected Areas:', 60, yStart + 100, { continued: true });
      doc.fillColor(colors.text).font(fonts.Body).text(` ${damage.affectedAreas}`);
    }
    
    // Add severity indicator if available
    if (damage.severity) {
      const severity = typeof damage.severity === 'number' ? 
        damage.severity : 
        (damage.severity === 'high' ? 3 : (damage.severity === 'medium' ? 2 : 1));
      
      const severityText = severity === 3 ? 'High' : (severity === 2 ? 'Medium' : 'Low');
      const severityColor = severity === 3 ? '#EF4444' : (severity === 2 ? '#F59E0B' : '#10B981');
      
      doc.rect(60, yStart + 125, 100, 25).fill(severityColor);
      doc.fillColor('#FFFFFF').fontSize(12).font(fonts.Heading).text(
        `Severity: ${severityText}`, 70, yStart + 132
      );
    }
  });
};

/**
 * Render a recommendations page
 * @param {Object} doc - The PDFKit document
 * @param {String} title - The page title
 * @param {Array} recommendations - Array of recommendation objects
 * @param {Object} colors - Color scheme
 * @param {Object} fonts - Font configuration
 * @param {Number} pageNumber - The page number
 */
const renderRecommendationsPage = (doc, title, recommendations, colors, fonts, pageNumber) => {
  // Page header
  pdfUtils.addPageHeader(doc, title, colors, fonts, pageNumber);
  
  recommendations.forEach((recommendation, index) => {
    const yStart = 80 + (index * 180);
    
    // Draw a light background for each recommendation
    doc.rect(50, yStart, doc.page.width - 100, 160)
      .fillAndStroke(colors.lightGray, colors.lightText);
      
    // Recommendation header
    doc.fillColor(colors.primary).fontSize(14).font(fonts.Heading)
      .text(recommendation.title || `Recommendation ${index + 1}`, 60, yStart + 10);
      
    // Recommendation details
    doc.fillColor(colors.text).fontSize(11).font(fonts.Body)
      .text(recommendation.description || 'No description provided', 60, yStart + 35, {
        width: doc.page.width - 120,
        height: 100,
        ellipsis: true
      });
  });
};

/**
 * Render a materials page
 * @param {Object} doc - The PDFKit document
 * @param {String} title - The page title
 * @param {Array} materials - Array of material objects
 * @param {Object} colors - Color scheme
 * @param {Object} fonts - Font configuration
 * @param {Number} pageNumber - The page number
 */
const renderMaterialsPage = (doc, title, materials, colors, fonts, pageNumber) => {
  // Page header
  pdfUtils.addPageHeader(doc, title, colors, fonts, pageNumber);
  
  if (typeof materials === 'string') {
    doc.fillColor(colors.text).fontSize(11).font(fonts.Body);
    doc.text(materials);
    return;
  }
  
  materials.forEach((material, index) => {
    // Material box with subtle background
    doc.rect(50, doc.y, doc.page.width - 100, 80).lineWidth(1).stroke(colors.primary);
    
    const name = material.name || `Material ${index + 1}`;
    const description = material.description 
      || (typeof material === 'string' ? material : 'No details available');
    
    // Material name
    doc.fillColor(colors.primary).fontSize(14).font(fonts.Heading)
       .text(name, 70, doc.y + 15, { width: doc.page.width - 140 });
    
    // Material description
    doc.fillColor(colors.text).fontSize(11).font(fonts.Body)
       .text(description, 70, doc.y + 40, { width: doc.page.width - 140 });
    
    doc.moveDown(5);
  });
};

/**
 * Render a large photo page
 * @param {Object} doc - The PDFKit document
 * @param {String} title - The page title
 * @param {Object} photo - The photo object
 * @param {Object} colors - Color scheme
 * @param {Object} fonts - Font configuration
 * @param {Number} pageNumber - The page number
 * @returns {Promise} Promise that resolves when the page is rendered
 */
const renderLargePhotoPage = async (doc, title, photo, colors, fonts, pageNumber) => {
  // Page header
  pdfUtils.addPageHeader(doc, title, colors, fonts, pageNumber);
  
  const photoWidth = doc.page.width - 100;  // Centered with 50pt margins
  const photoHeight = photoWidth * 0.75;    // 4:3 aspect ratio
  
  // Photo position (centered)
  const x = 50;
  const y = 80;
  
  // Get the caption for the photo
  const caption = photo.caption || photo.description || '';
  
  // Embed the photo using our embedPhoto function
  try {
    await photoHandler.embedPhoto(doc, photo, x, y, photoWidth, photoHeight, caption);
  } catch (error) {
    logger.error(`Error embedding large photo: ${error.message}`);
    photoHandler.addMissingImagePlaceholder(doc, x, y, photoWidth, photoHeight, caption);
  }
  
  // Add details if available
  if (photo.details) {
    doc.fontSize(10).font(fonts.Body).fillColor(colors.text);
    doc.text(photo.details, x, y + photoHeight + 40, { 
      width: photoWidth,
      align: 'left' 
    });
  }
  
  // Add AI analysis if available
  if (photo.aiAnalysis && photo.aiAnalysis.description) {
    const analysisY = y + photoHeight + (photo.details ? 80 : 40);
    
    doc.fontSize(12).font(fonts.Heading).fillColor(colors.primary);
    doc.text('AI Analysis', x, analysisY);
    
    doc.fontSize(10).font(fonts.Body).fillColor(colors.text);
    doc.text(photo.aiAnalysis.description, x, analysisY + 20, { 
      width: photoWidth,
      align: 'left' 
    });
    
    // Add tags if available
    if (photo.aiAnalysis.tags && photo.aiAnalysis.tags.length > 0) {
      const tagsY = doc.y + 10;
      doc.fontSize(10).font(fonts.Italic).fillColor(colors.secondary);
      doc.text(`Tags: ${photo.aiAnalysis.tags.join(', ')}`, x, tagsY, { 
        width: photoWidth,
        align: 'left' 
      });
    }
  }
};

/**
 * Render a photo grid page
 * @param {Object} doc - The PDFKit document
 * @param {String} title - The page title
 * @param {Array} photos - Array of photo objects
 * @param {Object} colors - Color scheme
 * @param {Object} fonts - Font configuration
 * @param {Number} pageNumber - The page number
 * @returns {Promise} Promise that resolves when the page is rendered
 */
const renderPhotoGridPage = async (doc, title, photos, colors, fonts, pageNumber) => {
  // Page header
  pdfUtils.addPageHeader(doc, title, colors, fonts, pageNumber);
  
  const pageWidth = doc.page.width - 100;
  const photoWidth = Math.min(240, pageWidth / 2 - 10); // 2 columns with some spacing
  const photoHeight = photoWidth * 0.75; // 4:3 aspect ratio
  
  // Grid positions for 4 photos in a 2x2 grid
  const positions = [
    { x: 50, y: 80 },  // Top left
    { x: 50 + photoWidth + 20, y: 80 },  // Top right
    { x: 50, y: 80 + photoHeight + 70 },  // Bottom left
    { x: 50 + photoWidth + 20, y: 80 + photoHeight + 70 }  // Bottom right
  ];
  
  for (let i = 0; i < photos.length; i++) {
    if (i < positions.length) {
      const photo = photos[i];
      const pos = positions[i];
      
      // Get the caption for the photo
      const caption = photo.caption || photo.description || '';
      
      // Embed the photo using our embedPhoto function
      try {
        await photoHandler.embedPhoto(doc, photo, pos.x, pos.y, photoWidth, photoHeight, caption);
      } catch (error) {
        logger.error(`Error embedding grid photo ${i}: ${error.message}`);
        photoHandler.addMissingImagePlaceholder(doc, pos.x, pos.y, photoWidth, photoHeight, caption);
      }
      
      // Add details if available
      if (photo.details) {
        doc.fontSize(9).font(fonts.Body).fillColor(colors.text);
        doc.text(photo.details, pos.x, pos.y + photoHeight + 30, { 
          width: photoWidth, 
          align: 'left' 
        });
      }
    }
  }
};

module.exports = {
  renderPage,
  renderCoverPage,
  renderSummaryPage,
  renderDamagesPage,
  renderRecommendationsPage,
  renderMaterialsPage,
  renderLargePhotoPage,
  renderPhotoGridPage
}; 