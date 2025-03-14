const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');
const photoHandler = require('./pdf/photoHandler');
const pageRenderers = require('./pdf/pageRenderers');
const pdfUtils = require('./pdf/pdfUtils');
const reportPrep = require('./pdf/reportPrep');

/**
 * Generates a PDF report with embedded photos and company branding
 * @param {Object} report - The report data
 * @returns {Promise<Buffer>} Buffer containing the generated PDF
 */
const generatePdf = async (report) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Initialize GridFS early to ensure it's ready when needed
      const gridfs = require('../utils/gridfs');
      const gfs = gridfs.initGridFS();
      
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
      
      // Log basic report info
      logger.info(`Report data: ${JSON.stringify({
        hasPhotos: !!plainReport.photos && plainReport.photos.length > 0,
        photoCount: plainReport.photos?.length || 0,
        hasPropertyAddress: !!plainReport.propertyAddress,
        hasTitle: !!plainReport.title,
        hasClientName: !!plainReport.clientName
      })}`);
      
      // Check if photos have blob URLs and log them
      if (plainReport.photos && plainReport.photos.length > 0) {
        const blobPhotos = plainReport.photos.filter(p => p.path && p.path.startsWith('blob:'));
        logger.info(`Found ${blobPhotos.length} photos with blob URLs`);
        
        if (blobPhotos.length > 0) {
          logger.info(`Sample blob photo: ${JSON.stringify({
            id: blobPhotos[0]._id,
            filename: blobPhotos[0].filename,
            path: blobPhotos[0].path
          })}`);
          
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
      }
      
      // Prepare report data
      const preparedReport = await reportPrep.prepareReportData(plainReport);
      
      // Create PDF document
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 50,
        info: {
          Title: preparedReport.title || 'Property Inspection Report',
          Author: preparedReport.user?.name || 'Property Inspector',
          Subject: `Property Inspection Report for ${preparedReport.clientName || 'Client'}`,
          Producer: 'PhotoReportApp',
          Creator: 'PhotoReportApp PDF Generator',
        },
        bufferPages: true,
        autoFirstPage: false,
        compress: true
      });
      
      // Set up buffer to collect PDF data
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      
      // When document is done, resolve with the complete buffer
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        logger.info(`PDF generated successfully, size: ${pdfBuffer.length} bytes`);
        resolve(pdfBuffer);
      });
      
      // Add error handler
      doc.on('error', (err) => {
        logger.error(`Error during PDF generation: ${err.message}`);
        reject(err);
      });
      
      // Get styling configuration
      const { fonts, colors, companyInfo, companyLogo } = await pdfUtils.getStyleConfig(preparedReport);
      
      // Create page structure
      const pages = await reportPrep.createPageStructure(preparedReport);
      logger.info(`Prepared ${pages.length} pages for report PDF`);
      
      // Render all pages
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex];
        doc.addPage();
        const pageNumber = pageIndex + 1;
        
        logger.info(`Rendering page ${pageNumber} of type: ${page.type}`);
        
        try {
          await pageRenderers.renderPage(doc, page, colors, fonts, pageNumber, companyInfo, companyLogo);
        } catch (error) {
          logger.error(`Error rendering page ${pageNumber} of type ${page.type}: ${error.message}`);
          // Continue with next page instead of failing the entire PDF
        }
      }
      
      // Add footers to all pages
      doc.flushPages();
      if (preparedReport._id) {
        pdfUtils.addFooters(doc, preparedReport._id.toString(), colors, fonts);
      }
      
      // Finalize the PDF
      doc.end();
    } catch (error) {
      logger.error(`Error generating PDF: ${error.message}`, { stack: error.stack });
      reject(error);
    }
  });
};

module.exports = {
  generatePdf
};