const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');
const photoHandler = require('./pdf/photoHandler');
const pageRenderers = require('./pdf/pageRenderers');
const pdfUtils = require('./pdf/pdfUtils');
const reportPrep = require('./pdf/reportPrep');

/**
 * Saves a generated PDF to GridFS and returns the file ID
 * @param {Buffer} pdfBuffer - The PDF buffer to save
 * @param {Object} report - The report data
 * @returns {Promise<string>} The GridFS file ID
 */
const savePdfToGridFS = async (pdfBuffer, report) => {
  try {
    const gridfs = require('../utils/gridfs');
    
    // Generate a filename based on report data
    const timestamp = Date.now();
    const reportId = report._id || 'unknown';
    const filename = `report_${reportId}_${timestamp}.pdf`;
    
    // Upload to the pdf_report bucket
    const fileInfo = await gridfs.uploadPdfReport(pdfBuffer, {
      filename,
      contentType: 'application/pdf',
      metadata: {
        reportId: reportId.toString(),
        reportTitle: report.title || 'Untitled Report',
        generatedDate: new Date(),
        version: '1.0'
      }
    });
    
    logger.info(`PDF saved to GridFS pdf_report bucket with ID: ${fileInfo.id}`);
    return fileInfo.id;
  } catch (error) {
    logger.error(`Error saving PDF to GridFS: ${error.message}`);
    throw error;
  }
};

/**
 * Generates a PDF report with embedded photos and company branding
 * @param {Object} report - The report data
 * @param {boolean} saveToGridFS - Whether to save the PDF to GridFS
 * @returns {Promise<Object>} Object containing the PDF buffer and file ID if saved
 */
const generatePdf = async (report, saveToGridFS = true) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Initialize GridFS early to ensure it's ready when needed
      const gridfs = require('../utils/gridfs');
      const gfs = await gridfs.initGridFS();
      
      if (!gfs) {
        logger.error('Failed to initialize GridFS for PDF generation');
        throw new Error('Failed to initialize GridFS');
      }
      
      logger.info(`Starting PDF generation for report: ${report._id}`);
      
      // Convert report to plain JavaScript object to avoid Mongoose document issues
      let plainReport;
      if (report.toObject) {
        plainReport = report.toObject();
        logger.info('Converted Mongoose document to plain object with toObject()');
      } else if (report.toJSON) {
        plainReport = report.toJSON();
        logger.info('Converted document to plain object with toJSON()');
      } else {
        plainReport = { ...report };
        // Explicitly copy the photos array to ensure it's preserved
        if (report.photos && Array.isArray(report.photos)) {
          plainReport.photos = [...report.photos];
        }
        logger.info('Copied report object properties');
      }
      
      // Log to confirm the photos array is present
      logger.info(`PlainReport has photos: ${!!plainReport.photos}, count: ${plainReport.photos?.length || 0}`);
      
      // Check for blob URLs in photos
      if (plainReport.photos && plainReport.photos.length > 0) {
        const blobPhotos = plainReport.photos.filter(p => p.path && p.path.startsWith('blob:'));
        logger.info(`Found ${blobPhotos.length} photos with blob URLs`);
        
        // DIRECTLY FIX: If we still have blob URLs at this point, modify the report object
        // before passing it to prepareReportData
        if (blobPhotos.length > 0) {
          const gridfs = require('../utils/gridfs');
          const allFiles = await gridfs.findFiles({});
          
          // Create a map of filenames to GridFS IDs
          const filenameMap = {};
          allFiles.forEach(file => {
            if (file.filename) {
              filenameMap[file.filename] = file._id.toString(); // Convert to string
              
              // Also map variations without timestamp prefix
              const withoutTimestamp = file.filename.replace(/^\d+-/, '');
              if (withoutTimestamp !== file.filename) {
                filenameMap[withoutTimestamp] = file._id.toString(); // Convert to string
              }
            }
          });
          
          // Create a completely new photos array with plain objects (not Mongoose documents)
          const updatedPhotos = [];
          
          // Process each photo
          for (const photo of plainReport.photos) {
            try {
              // Start with a clean plain JavaScript object
              const newPhoto = {};
              
              // Copy all properties from the original photo
              if (photo.toObject) {
                // If it's a Mongoose document, convert to object first
                Object.assign(newPhoto, photo.toObject());
              } else {
                // Otherwise just copy properties
                Object.assign(newPhoto, photo);
              }
              
              // If it's a blob URL and we can find a matching file by filename
              if (photo.path && photo.path.startsWith('blob:') && photo.filename && filenameMap[photo.filename]) {
                // Set the gridfsId property
                newPhoto.gridfsId = filenameMap[photo.filename];
                // Important: DELETE the blob path to force the system to use gridfsId
                delete newPhoto.path;
                logger.info(`Created new photo object with gridfsId: ${newPhoto.gridfsId} for filename: ${photo.filename}`);
              }
              
              updatedPhotos.push(newPhoto);
            } catch (err) {
              logger.error(`Error processing photo: ${err.message}`);
              // Still include the original photo
              updatedPhotos.push(photo);
            }
          }
          
          // Replace the photos array with our fixed version
          plainReport.photos = updatedPhotos;
          logger.info(`Directly fixed report photos for PDF generation: removed blob paths and added ${updatedPhotos.filter(p => p.gridfsId).length} gridfsIds`);
        }
      }
      
      // Prepare report data
      const preparedReport = await reportPrep.prepareReportData(plainReport);
      
      // Create a new PDF document
      const doc = new PDFDocument({
        autoFirstPage: false,
        size: 'LETTER',
        margin: 50,
        info: {
          Title: preparedReport.title || 'Property Inspection Report',
          Author: preparedReport.company?.name || 'HeroReport',
          Subject: 'Property Inspection Report',
          Keywords: 'inspection, property, report',
          CreationDate: new Date()
        }
      });
      
      // Collect PDF chunks
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      
      // Handle errors
      doc.on('error', err => {
        logger.error(`PDF generation error: ${err.message}`);
        reject(err);
      });
      
      // When PDF is finalized
      doc.on('end', async () => {
        try {
          // Combine chunks into a single buffer
          const pdfBuffer = Buffer.concat(chunks);
          logger.info(`PDF generated successfully, size: ${pdfBuffer.length} bytes`);
          
          // Save to GridFS if requested
          let fileId = null;
          if (saveToGridFS && pdfBuffer.length > 0) {
            fileId = await savePdfToGridFS(pdfBuffer, preparedReport);
          }
          
          // Resolve with both the buffer and file ID
          resolve({
            buffer: pdfBuffer,
            fileId: fileId
          });
        } catch (finalizeError) {
          logger.error(`Error finalizing PDF: ${finalizeError.message}`);
          reject(finalizeError);
        }
      });
      
      // Create page structure
      const pageStructure = await reportPrep.createPageStructure(preparedReport);
      
      // Get style configuration
      const { fonts, colors, companyInfo, companyLogo } = await pdfUtils.getStyleConfig(preparedReport);
      
      // Render each page
      for (let i = 0; i < pageStructure.length; i++) {
        const page = pageStructure[i];
        // Add a new page
        doc.addPage();
        
        // Render the page content with all required parameters
        await pageRenderers.renderPage(doc, page, colors, fonts, i + 1, companyInfo, companyLogo);
      }
      
      // Finalize the PDF
      doc.end();
    } catch (error) {
      logger.error(`PDF generation failed: ${error.message}`);
      reject(error);
    }
  });
};

module.exports = {
  generatePdf,
  savePdfToGridFS
};