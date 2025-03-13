const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const Company = require('../models/Company');

/**
 * Generates a PDF report with embedded photos and company branding
 * @param {Object} report - The report data
 * @returns {Promise<Buffer>} Buffer containing the generated PDF
 */
const generatePdf = async (report) => {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info(`Starting PDF generation for report: ${report._id}`);
      
      // Create a new PDF document
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: report.title || `Property Inspection Report`,
          Author: report.user?.name || 'Property Inspector',
          Subject: `Property Inspection Report for ${report.clientName || 'Client'}`,
          Producer: 'PhotoReportApp', // Add software producer info
          Creator: 'PhotoReportApp PDF Generator', // Add creator info
        },
        bufferPages: true,  // <---- Buffer pages so we can add footers after layout
        autoFirstPage: false,
        compress: true
      });
      
      // Collect PDF data in a buffer
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      
      // Set up promise to resolve with buffer when done
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
      
      // Define colors for consistent branding
      const colors = {
        primary: '#2563EB', // Royal blue
        secondary: '#475569', // Slate gray
        accent: '#F97316', // Orange
        background: '#F8FAFC', // Light gray background
        text: '#1E293B', // Dark slate for text
        light: '#F1F5F9', // Very light gray
        success: '#10B981', // Green
        warning: '#F59E0B' // Amber
      };
      
      // Define fonts
      doc.registerFont('Heading', 'Helvetica-Bold');
      doc.registerFont('Body', 'Helvetica');
      doc.registerFont('Italic', 'Helvetica-Oblique');
      
      // Fetch company info if available
      let companyInfo = null;
      let companyLogo = null;
      
      try {
        if (report.company) {
          const company = await Company.findById(report.company);
          if (company) {
            companyInfo = company;
            
            // Try to load company logo if available
            if (company.logoPath) {
              const logoPath = path.join(process.cwd(), company.logoPath);
              if (fs.existsSync(logoPath)) {
                companyLogo = logoPath;
              }
            }
          }
        }
      } catch (err) {
        logger.warn(`Could not fetch company info: ${err.message}`);
      }
      
      // Create an array to keep track of all the pages we'll add
      const pages = [];
      
      // ===== Cover Page =====
      pages.push({ type: 'cover', content: { report, companyInfo, companyLogo } });
      
      // ===== Summary Page =====
      if (report.summary) {
        pages.push({ type: 'summary', content: { report } });
      }
      
      // ===== Damages Section =====
      if (report.damages && report.damages.length > 0) {
        let damages = report.damages;
        if (!Array.isArray(damages)) {
          damages = typeof damages === 'string' ? [{ description: damages }] : [];
        }
        
        if (damages.length > 0) {
          // First damages page
          pages.push({ 
            type: 'damages', 
            content: { 
              title: 'Damage Assessment',
              damages: damages.slice(0, 3)
            }
          });
          
          // Additional damages pages if needed
          for (let i = 3; i < damages.length; i += 3) {
            pages.push({ 
              type: 'damages', 
              content: { 
                title: 'Damage Assessment (Continued)',
                damages: damages.slice(i, i + 3)
              }
            });
          }
        }
      }
      
      // ===== Recommendations =====
      if (report.recommendations && report.recommendations.length > 0) {
        let recommendations = report.recommendations;
        if (typeof recommendations === 'string') {
          recommendations = [{ description: recommendations }];
        }
        
        if (Array.isArray(recommendations) && recommendations.length > 0) {
          // First recommendations page
          pages.push({ 
            type: 'recommendations', 
            content: { 
              title: 'Recommendations',
              recommendations: recommendations.slice(0, 3)
            }
          });
          
          // Additional recommendations pages if needed
          for (let i = 3; i < recommendations.length; i += 3) {
            pages.push({ 
              type: 'recommendations', 
              content: { 
                title: 'Recommendations (Continued)',
                recommendations: recommendations.slice(i, i + 3)
              }
            });
          }
        }
      }
      
      // ===== Materials =====
      if (report.materials && report.materials.length > 0) {
        let materials = report.materials;
        if (typeof materials === 'string') {
          materials = [{ description: materials }];
        }
        
        if (Array.isArray(materials) && materials.length > 0) {
          // First materials page
          pages.push({ 
            type: 'materials', 
            content: { 
              title: 'Building Materials',
              materials: materials.slice(0, 3)
            }
          });
          
          // Additional materials pages if needed
          for (let i = 3; i < materials.length; i += 3) {
            pages.push({ 
              type: 'materials', 
              content: { 
                title: 'Building Materials (Continued)',
                materials: materials.slice(i, i + 3)
              }
            });
          }
        }
      }
      
      // ===== Photo Gallery =====
      if (report.photos && report.photos.length > 0) {
        // Filter to only include photos with filenames and valid paths
        const availablePhotos = report.photos.filter(photo => {
          const photoPath = findPhotoPath(photo);
          return !!photo.filename && !!photoPath;
        });
        
        logger.info(`Available photos with valid paths: ${availablePhotos.length} of ${report.photos.length}`);
        
        if (availablePhotos.length > 0) {
          // Sort photos with analyses first - using aiAnalysis instead of analysis
          const analysisPhotos = availablePhotos.filter(photo => 
            photo.aiAnalysis && (photo.aiAnalysis.description || photo.aiAnalysis.damageDetected)
          );
          const regularPhotos = availablePhotos.filter(photo => 
            !(photo.aiAnalysis && (photo.aiAnalysis.description || photo.aiAnalysis.damageDetected))
          );
          
          // Add large photo analysis pages
          for (let i = 0; i < analysisPhotos.length; i++) {
            pages.push({ 
              type: 'photo_large', 
              content: {
                title: i === 0 ? 'Property Photos - Analysis' : 'Property Photos - Analysis (Continued)',
                photo: analysisPhotos[i]
              }
            });
          }
          
          // Add grid photo pages
          for (let i = 0; i < regularPhotos.length; i += 4) {
            const pagePhotos = regularPhotos.slice(i, i + 4);
            if (pagePhotos.length > 0) {
              pages.push({ 
                type: 'photo_grid', 
                content: {
                  title: analysisPhotos.length === 0 && i === 0 ? 
                    'Property Photos' : 'Property Photos (Continued)',
                  photos: pagePhotos
                }
              });
            }
          }
        }
      }
      
      logger.info(`Prepared ${pages.length} pages for report PDF`);
      
      // ========== RENDER ALL PAGES ==========
      pages.forEach((page) => {
        doc.addPage();
        
        switch (page.type) {
          case 'cover':
            renderCoverPage(doc, page.content.report, page.content.companyInfo, 
                            page.content.companyLogo, colors);
            break;
          case 'summary':
            renderSummaryPage(doc, page.content.report, colors);
            break;
          case 'damages':
            renderDamagesPage(doc, page.content.title, page.content.damages, colors);
            break;
          case 'recommendations':
            renderRecommendationsPage(doc, page.content.title, page.content.recommendations, colors);
            break;
          case 'materials':
            renderMaterialsPage(doc, page.content.title, page.content.materials, colors);
            break;
          case 'photo_large':
            renderLargePhotoPage(doc, page.content.title, page.content.photo, colors);
            break;
          case 'photo_grid':
            renderPhotoGridPage(doc, page.content.title, page.content.photos, colors);
            break;
          default:
            // Just skip if unknown type
            break;
        }
      });
      
      // ===== Now that all content is placed, flush & add footers =====
      doc.flushPages(); // Ensures page layout is finalized
      const totalPages = doc.bufferedPageRange().count;
      
      // We assume we skip the cover page for numbering by starting at i=1.
      // If you want the cover to be "Page 1," just change to i=0.
      for (let i = 1; i < totalPages; i++) {
        doc.switchToPage(i);
        
        doc.fontSize(8).fillColor(colors.secondary);
        doc.text(
          `${report.title || 'Property Report'} • Page ${i} of ${totalPages - 1}`,
          50,
          doc.page.height - 30,
          { align: 'center' }
        );
        
        // Add report date in footer
        const reportDate = new Date(report.inspectionDate || Date.now()).toLocaleDateString();
        doc.text(
          `Generated on: ${reportDate}`,
          50,
          doc.page.height - 20,
          { align: 'center' }
        );
      }
      
      logger.info(`Final PDF page count (buffered): ${totalPages}`);
      
      // Finalize the PDF
      doc.end();
      
    } catch (error) {
      logger.error(`Error generating PDF: ${error.message}`, { stack: error.stack });
      reject(error);
    }
  });
};

/**
 * Render a cover page
 */
const renderCoverPage = (doc, report, companyInfo, companyLogo, colors) => {
  // Draw header bar
  doc.rect(0, 0, doc.page.width, 120).fill(colors.primary);
  
  // Add logo if available
  if (companyLogo) {
    doc.image(companyLogo, 50, 30, { width: 150 });
  } else if (companyInfo && companyInfo.name) {
    doc.fillColor('#FFFFFF').fontSize(24).font('Heading');
    doc.text(companyInfo.name, 50, 50);
  }
  
  // Add report title
  const titleY = 180;
  doc.fillColor(colors.primary).fontSize(30).font('Heading');
  doc.text(report.title || 'Property Inspection Report', 50, titleY, { align: 'center' });
  
  // Add property image if available
  if (report.photos && report.photos.length > 0) {
    const mainPhoto = report.photos[0];
    const photoPath = findPhotoPath(mainPhoto);
    
    if (photoPath) {
      // Draw the property image with a border
      const imageWidth = 300;
      const imageX = (doc.page.width - imageWidth) / 2;
      doc.rect(imageX - 5, titleY + 50 - 5, imageWidth + 10, imageWidth * 0.75 + 10).fill(colors.light);
      doc.image(photoPath, imageX, titleY + 50, { width: imageWidth, height: imageWidth * 0.75 });
    }
  }
  
  // Client info box
  const boxY = doc.page.height - 200;
  doc.rect(50, boxY, doc.page.width - 100, 120).lineWidth(1).stroke(colors.primary);
  
  doc.fillColor(colors.primary).fontSize(14).font('Heading');
  doc.text('CLIENT INFORMATION', 70, boxY + 20);
  doc.fillColor(colors.text).fontSize(11).font('Body');
  
  let clientInfoY = boxY + 45;
  doc.text(`Client: ${report.clientName || 'N/A'}`, 70, clientInfoY);
  clientInfoY += 20;
  
  if (report.propertyAddress) {
    const address = report.propertyAddress;
    doc.text(`Property Address: ${[
      address.street,
      address.city,
      address.state,
      address.zipCode,
      address.country
    ].filter(Boolean).join(', ') || 'N/A'}`, 70, clientInfoY);
    clientInfoY += 20;
  }
  
  doc.text(`Inspection Date: ${new Date(report.inspectionDate || Date.now()).toLocaleDateString()}`, 70, clientInfoY);
};

/**
 * Render a summary page
 */
const renderSummaryPage = (doc, report, colors) => {
  // Page header
  addPageHeader(doc, 'Report Summary', colors);
  
  // Summary content
  doc.moveDown();
  doc.fillColor(colors.text).fontSize(11).font('Body');
  doc.text(report.summary);
  
  // Add a key findings box if damages exist
  if (report.damages && report.damages.length > 0) {
    doc.moveDown(2);
    
    // Key findings box header
    doc.rect(50, doc.y, doc.page.width - 100, 30).fill(colors.primary);
    doc.fillColor('#FFFFFF').fontSize(14).font('Heading');
    doc.text('KEY FINDINGS', 70, doc.y - 25);
    
    // Key findings content
    doc.rect(50, doc.y + 5, doc.page.width - 100, 
             Math.min(report.damages.length * 25 + 20, 150)).fill(colors.light);
    
    let yPos = doc.y + 15;
    doc.fillColor(colors.text).fontSize(11).font('Body');
    
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
 */
const renderDamagesPage = (doc, title, damages, colors) => {
  // Page header
  addPageHeader(doc, title, colors);
  
  damages.forEach((damage, index) => {
    // Damage header with colored background based on severity
    let severityColor = colors.secondary;
    if (damage.severity) {
      if (damage.severity.toLowerCase().includes('severe')) {
        severityColor = colors.accent;
      } else if (damage.severity.toLowerCase().includes('moderate')) {
        severityColor = colors.warning;
      } else if (damage.severity.toLowerCase().includes('minor')) {
        severityColor = colors.success;
      }
    }
    
    // Damage type header
    doc.rect(50, doc.y, doc.page.width - 100, 30).fill(severityColor);
    doc.fillColor('#FFFFFF').fontSize(12).font('Heading');
    doc.text(
      `${index + 1}. ${damage.type || 'Damage'}${damage.severity ? ` - ${damage.severity}` : ''}`,
      70, 
      doc.y - 25
    );
    
    // Damage details in a box
    doc.rect(50, doc.y + 5, doc.page.width - 100, 80).fill(colors.light);
    doc.fillColor(colors.text).fontSize(11).font('Body');
    
    // Description
    const description = damage.description 
      || (typeof damage === 'string' ? damage : 'No details available');
    
    doc.text(description, 70, doc.y + 15, {
      width: doc.page.width - 140,
    });
    
    // Affected areas if available
    if (damage.affectedAreas) {
      doc.moveDown();
      doc.fillColor(colors.primary).font('Heading').text('Affected Areas:', { continued: true });
      doc.fillColor(colors.text).font('Body').text(` ${damage.affectedAreas}`);
    }
    
    doc.moveDown(2);
  });
};

/**
 * Render a recommendations page
 */
const renderRecommendationsPage = (doc, title, recommendations, colors) => {
  // Page header
  addPageHeader(doc, title, colors);
  
  recommendations.forEach((recommendation, index) => {
    // Determine if this is a complex object or just a string
    const recTitle = recommendation.title || `Recommendation ${index + 1}`;
    const description = recommendation.description 
      || (typeof recommendation === 'string' ? recommendation : 'No details available');
    
    // Recommendation number circle
    doc.circle(65, doc.y + 10, 15).fill(colors.primary);
    doc.fillColor('#FFFFFF').fontSize(12).font('Heading').text(
      (index + 1).toString(), 
      65 - 5, 
      doc.y + 5,
      { width: 10, align: 'center' }
    );
    
    // Recommendation title and description
    doc.fillColor(colors.primary).fontSize(14).font('Heading')
       .text(recTitle, 90, doc.y, { width: doc.page.width - 140 });
    
    doc.moveDown(0.5);
    doc.fillColor(colors.text).fontSize(11).font('Body')
       .text(description, 90, doc.y, { width: doc.page.width - 140 });
    
    doc.moveDown(2);
  });
};

/**
 * Render a materials page
 */
const renderMaterialsPage = (doc, title, materials, colors) => {
  // Page header
  addPageHeader(doc, title, colors);
  
  if (typeof materials === 'string') {
    doc.fillColor(colors.text).fontSize(11).font('Body');
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
    doc.fillColor(colors.primary).fontSize(14).font('Heading')
       .text(name, 70, doc.y + 15, { width: doc.page.width - 140 });
    
    // Material description
    doc.fillColor(colors.text).fontSize(11).font('Body')
       .text(description, 70, doc.y + 40, { width: doc.page.width - 140 });
    
    doc.moveDown(5);
  });
};

/**
 * Render a large photo with analysis page
 */
const renderLargePhotoPage = (doc, title, photo, colors) => {
  // Page header
  addPageHeader(doc, title, colors);
  
  const photoPath = findPhotoPath(photo);
  if (!photoPath) {
    doc.fillColor(colors.text).fontSize(12).font('Body');
    doc.text('Could not load photo. File may be missing.', 50, doc.y + 20);
    return;
  }
  
  const photoWidth = doc.page.width - 100;
  const photoHeight = photoWidth * 0.75; // 4:3 aspect ratio
  const xPosition = 50;
  const yPosition = doc.y + 10;
  
  // Add border
  doc.rect(xPosition - 2, yPosition - 2, photoWidth + 4, photoHeight + 4)
     .lineWidth(2).stroke(colors.primary);
  
  try {
    doc.image(photoPath, xPosition, yPosition, {
      width: photoWidth,
      height: photoHeight,
      align: 'center'
    });
  } catch (err) {
    logger.error(`Error embedding photo in PDF: ${err.message}`);
    doc.fillColor(colors.accent).fontSize(14).font('Body');
    doc.text('Error loading image', xPosition + photoWidth / 2 - 50, yPosition + photoHeight / 2);
    // Move down so we can place analysis text below
    doc.y = yPosition + photoHeight;
  }
  
  // Add metadata above the photo
  const metadataY = yPosition - 20;
  addPhotoMetadata(doc, photo, xPosition, metadataY, photoWidth, colors);
  
  // Analysis box below photo
  if (photo.aiAnalysis) {
    const analysis = photo.aiAnalysis;
    const boxY = yPosition + photoHeight + 20;
    
    // Background
    const boxHeight = 150; 
    doc.rect(xPosition, boxY, photoWidth, boxHeight).fill(colors.light);
    
    if (analysis.damageDetected) {
      let severityColor = colors.success;
      if (analysis.severity) {
        if (analysis.severity.toLowerCase().includes('severe')) {
          severityColor = colors.accent;
        } else if (analysis.severity.toLowerCase().includes('moderate')) {
          severityColor = colors.warning;
        }
      }
      
      // Colored bar for severity
      doc.rect(xPosition, boxY, 15, boxHeight).fill(severityColor);
      
      // Damage type & severity
      doc.fillColor(colors.primary).fontSize(14).font('Heading');
      doc.text(analysis.damageType || 'Damage Detected', xPosition + 25, boxY + 15);
      
      if (analysis.severity) {
        doc.fillColor(severityColor).fontSize(12).font('Heading');
        doc.text(analysis.severity, xPosition + 25, boxY + 35);
      }
      
      // Location
      if (analysis.location) {
        doc.fillColor(colors.secondary).fontSize(11).font('Body');
        doc.text(`Location: ${analysis.location}`, xPosition + 25, boxY + 55);
      }
      
      // Detailed description
      if (analysis.description) {
        doc.fillColor(colors.text).fontSize(10).font('Body');
        doc.text(analysis.description, xPosition + 25, boxY + 75, {
          width: photoWidth - 30,
          height: 60,
          ellipsis: true
        });
      }
    } else {
      // No damage
      doc.rect(xPosition, boxY, 15, boxHeight).fill(colors.success);
      
      doc.fillColor(colors.primary).fontSize(14).font('Heading');
      doc.text('No Damage Detected', xPosition + 25, boxY + 15);
      
      if (analysis.location) {
        doc.fillColor(colors.secondary).fontSize(11).font('Body');
        doc.text(`Location: ${analysis.location}`, xPosition + 25, boxY + 40);
      }
      
      if (analysis.description) {
        doc.fillColor(colors.text).fontSize(10).font('Body');
        doc.text(analysis.description, xPosition + 25, boxY + 60, {
          width: photoWidth - 40,
          height: 80,
          ellipsis: true
        });
      }
    }
  } else if (photo.description || photo.userDescription) {
    // Just a caption
    const captionY = yPosition + photoHeight + 5;
    doc.fontSize(10).font('Italic').fillColor(colors.text);
    doc.text(photo.description || photo.userDescription, xPosition, captionY, {
      width: photoWidth,
      align: 'center'
    });
  }
};

/**
 * Render a photo grid page
 */
const renderPhotoGridPage = (doc, title, photos, colors) => {
  // Page header
  addPageHeader(doc, title, colors);
  
  const pageWidth = doc.page.width - 100;
  const photoWidth = (pageWidth / 2) - 10; // 2 photos per row
  const photoHeight = photoWidth * 0.75;
  const padding = 20;
  
  // Positions in a 2x2 grid
  const positions = [
    { x: 50, y: doc.y + 10 },
    { x: 50 + photoWidth + padding, y: doc.y + 10 },
    { x: 50, y: doc.y + 10 + photoHeight + padding },
    { x: 50 + photoWidth + padding, y: doc.y + 10 + photoHeight + padding }
  ];
  
  let addedPhotoCount = 0;
  
  photos.forEach((photo, i) => {
    try {
      if (i >= positions.length) return;
      
      const photoPath = findPhotoPath(photo);
      if (!photoPath) {
        logger.warn(`Skipping photo at position ${i}, file not found: ${photo.filename}`);
        return;
      }
      
      const pos = positions[i];
      
      // Add border
      doc.rect(pos.x - 2, pos.y - 2, photoWidth + 4, photoHeight + 4)
         .lineWidth(1).stroke(colors.primary);
      
      try {
        doc.image(photoPath, pos.x, pos.y, {
          width: photoWidth,
          height: photoHeight
        });
        addedPhotoCount++;
      } catch (err) {
        logger.error(`Error embedding photo ${i} in PDF: ${err.message}`);
        doc.fillColor(colors.accent).fontSize(12).font('Body');
        doc.text('Error loading image', pos.x + 30, pos.y + 60);
      }
      
      // Metadata above photo
      addPhotoMetadata(doc, photo, pos.x, pos.y - 15, photoWidth, colors);
      
      // Caption
      if (photo.description) {
        doc.fontSize(9).font('Italic').fillColor(colors.text);
        doc.text(photo.description, pos.x, pos.y + photoHeight + 5, {
          width: photoWidth,
          height: 20,
          ellipsis: true
        });
      }
    } catch (err) {
      logger.error(`Error adding photo ${i} to grid: ${err.message}`);
    }
  });
  
  if (addedPhotoCount === 0) {
    doc.fontSize(12).font('Body').fillColor(colors.text);
    doc.text('Could not load photos for this page.', 50, positions[0].y + 50);
  }
};

/**
 * Add consistent page header
 */
const addPageHeader = (doc, title, colors) => {
  // Draw header bar
  doc.rect(0, 0, doc.page.width, 50).fill(colors.primary);
  
  // Add section title
  doc.fillColor('#FFFFFF').fontSize(18).font('Heading');
  doc.text(title, 50, 15);
  
  // Reset position for content
  doc.moveDown(3);
};

/**
 * Add metadata to a photo
 */
const addPhotoMetadata = (doc, photo, x, y, width, colors) => {
  doc.fontSize(8).font('Body').fillColor(colors.secondary);
  
  const metadata = photo.metadata || (photo.uploadedData ? photo.uploadedData.metadata : null);
  if (!metadata && !photo.filename) return;
  
  const metadataLines = [];
  
  // First line: filename and dimensions
  let line1 = '';
  if (photo.filename) {
    line1 += `File: ${photo.filename}`;
  }
  if (metadata && metadata.width && metadata.height) {
    line1 += line1 
      ? ` • ${metadata.width}×${metadata.height}`
      : `${metadata.width}×${metadata.height}`;
  }
  if (line1) metadataLines.push(line1);
  
  // Second line: date, camera, exposure
  let line2 = '';
  
  // Date taken
  if (metadata && metadata.takenAt) {
    try {
      const date = new Date(metadata.takenAt);
      if (!isNaN(date.getTime())) {
        line2 += `Taken: ${date.toLocaleString()}`;
      }
    } catch (e) {
      line2 += `Taken: ${metadata.takenAt}`;
    }
  }
  
  // Camera
  if (metadata && metadata.camera) {
    line2 += line2 ? ` • Camera: ${metadata.camera}` : `Camera: ${metadata.camera}`;
  }
  
  // Exposure
  let exposureInfo = '';
  if (metadata) {
    if (metadata.fNumber) {
      let fNum = metadata.fNumber;
      if (Array.isArray(fNum) && fNum.length === 2) {
        fNum = `f/${(fNum[0] / fNum[1]).toFixed(1)}`;
      } else if (typeof fNum === 'number') {
        fNum = `f/${fNum.toFixed(1)}`;
      }
      exposureInfo += fNum;
    }
    
    if (metadata.exposureTime) {
      let eTime = metadata.exposureTime;
      if (Array.isArray(eTime) && eTime.length === 2) {
        exposureInfo += exposureInfo 
          ? `, 1/${Math.round(eTime[1] / eTime[0])}s`
          : `1/${Math.round(eTime[1] / eTime[0])}s`;
      } else if (typeof eTime === 'number' && eTime < 1) {
        exposureInfo += exposureInfo 
          ? `, 1/${Math.round(1 / eTime)}s`
          : `1/${Math.round(1 / eTime)}s`;
      } else {
        exposureInfo += exposureInfo ? `, ${eTime}s` : `${eTime}s`;
      }
    }
    
    if (metadata.iso) {
      exposureInfo += exposureInfo ? `, ISO ${metadata.iso}` : `ISO ${metadata.iso}`;
    }
  }
  
  if (exposureInfo) {
    line2 += line2 ? ` • ${exposureInfo}` : exposureInfo;
  }
  
  if (line2) metadataLines.push(line2);
  
  // Third line: GPS if available
  if (metadata && (metadata.latitude !== undefined && metadata.longitude !== undefined)) {
    const lat = metadata.latitude;
    const lon = metadata.longitude;
    const latStr = Math.abs(lat).toFixed(6) + (lat >= 0 ? '°N' : '°S');
    const lonStr = Math.abs(lon).toFixed(6) + (lon >= 0 ? '°E' : '°W');
    metadataLines.push(`Location: ${latStr}, ${lonStr}`);
  }
  
  // Output metadata lines
  metadataLines.forEach((line, index) => {
    doc.text(line, x, y + (index * 10), { width, align: 'left' });
  });
};

/**
 * Find the file path for a photo, trying multiple possible locations
 */
const findPhotoPath = (photo) => {
  const possiblePaths = [
    path.join(process.cwd(), 'temp', photo.filename),
    path.join(process.cwd(), 'temp', photo.filename.replace('.jpeg', '_optimized.jpeg').replace('.jpg', '_optimized.jpg')),
    path.join(process.cwd(), 'uploads', photo.filename),
    path.join('./backend/temp', photo.filename),
    path.join('./backend/uploads', photo.filename),
    photo.path
  ];
  
  for (const testPath of possiblePaths) {
    try {
      if (testPath && fs.existsSync(testPath)) {
        return testPath;
      }
    } catch (err) {}
  }
  
  return null;
};

module.exports = {
  generatePdf
};