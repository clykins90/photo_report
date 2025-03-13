const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const User = require('../models/User');

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
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex];
        doc.addPage();
        const pageNumber = pageIndex + 1; // Start page numbering at 1
        
        switch (page.type) {
          case 'cover':
            renderCoverPage(doc, page.content.report, page.content.companyInfo, 
                          page.content.companyLogo, colors, fonts, pageNumber);
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
            // Just skip if unknown type
            break;
        }
      }
      
      // ===== Now that all content is placed, flush & add footers =====
      doc.flushPages(); // Ensures page layout is finalized
      const totalPages = doc.bufferedPageRange().count;
      
      // We moved page numbering to the addFooters function, 
      // so we don't need to add it here anymore.
      /*
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
      */
      
      logger.info(`Final PDF page count (buffered): ${totalPages}`);
      
      // Add page numbers and footers
      if (report._id) {
        addFooters(doc, report._id.toString(), colors, fonts);
      }
      
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
const renderCoverPage = (doc, report, companyInfo, companyLogo, colors, fonts, pageNumber) => {
  // We don't show page numbers on the cover, so we don't use the pageNumber parameter
  
  // Draw header bar
  doc.rect(0, 0, doc.page.width, 120).fill(colors.primary);
  
  // Add logo if available
  if (companyLogo) {
    doc.image(companyLogo, 50, 30, { width: 150 });
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
  
  doc.fillColor(colors.primary).fontSize(14).font(fonts.Heading);
  doc.text('CLIENT INFORMATION', 70, boxY + 20);
  doc.fillColor(colors.text).fontSize(11).font(fonts.Body);
  
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
const renderSummaryPage = (doc, report, colors, fonts, pageNumber) => {
  // Page header
  addPageHeader(doc, 'Report Summary', colors, fonts, pageNumber);
  
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
  
  // Property details
  const detailsY = report.summary ? 200 : 80;
  doc.fillColor(colors.primary).fontSize(14).font(fonts.Heading);
  doc.text('Property Details', 50, detailsY);
  
  // Create a details table
  const detailsStartY = detailsY + 25;
  if (report.propertyAddress) {
    doc.fillColor(colors.text).fontSize(11).font(fonts.Body);
    doc.text('Address:', 50, detailsStartY, { continued: true });
    doc.text(` ${report.propertyAddress}`, { paragraphGap: 5 });
  }
  
  // Add a key findings box if damages exist
  if (report.damages && report.damages.length > 0) {
    doc.moveDown(2);
    
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
 */
const renderDamagesPage = (doc, title, damages, colors, fonts, pageNumber) => {
  // Page header
  addPageHeader(doc, title, colors, fonts, pageNumber);
  
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
 */
const renderRecommendationsPage = (doc, title, recommendations, colors, fonts, pageNumber) => {
  // Page header
  addPageHeader(doc, title, colors, fonts, pageNumber);
  
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
 */
const renderMaterialsPage = (doc, title, materials, colors, fonts, pageNumber) => {
  // Page header
  addPageHeader(doc, title, colors, fonts, pageNumber);
  
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
 */
const renderLargePhotoPage = async (doc, title, photo, colors, fonts, pageNumber) => {
  // Page header
  addPageHeader(doc, title, colors, fonts, pageNumber);
  
  const photoWidth = doc.page.width - 100;  // Centered with 50pt margins
  const photoHeight = photoWidth * 0.75;    // 4:3 aspect ratio
  
  // Photo position (centered)
  const x = 50;
  const y = 80;
  
  // Get the caption for the photo
  const caption = photo.caption || photo.description || '';
  
  // Embed the photo using our new function
  await embedPhoto(doc, photo, x, y, photoWidth, photoHeight, caption);
  
  // Add details if available
  if (photo.details) {
    doc.fontSize(10).font(fonts.Body).fillColor(colors.text);
    doc.text(photo.details, x, y + photoHeight + 40, { 
      width: photoWidth,
      align: 'left' 
    });
  }
};

/**
 * Render a photo grid page
 */
const renderPhotoGridPage = async (doc, title, photos, colors, fonts, pageNumber) => {
  // Page header
  addPageHeader(doc, title, colors, fonts, pageNumber);
  
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
      
      // Embed the photo using our new function
      await embedPhoto(doc, photo, pos.x, pos.y, photoWidth, photoHeight, caption);
      
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

/**
 * Add consistent page header
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
 * Add metadata to a photo
 */
const addPhotoMetadata = (doc, photo, x, y, width, colors, fonts) => {
  doc.fontSize(8).font(fonts.Body).fillColor(colors.secondary);
  
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
  // Check if we're in Vercel environment
  const isVercel = process.env.VERCEL === '1';
  
  // In Vercel, we should use GridFS instead of filesystem
  if (isVercel) {
    // If photo has a gridfs id, return a special marker to handle it differently
    if (photo.gridfsId || photo.id || (photo.gridfs && photo.gridfs.id)) {
      const photoId = photo.gridfsId || photo.id || (photo.gridfs && photo.gridfs.id);
      return `gridfs:${photoId}`;
    }
    
    // If no GridFS ID is available, return null - we can't access filesystem in Vercel
    logger.warn(`No GridFS ID available for photo in Vercel environment`);
    return null;
  }
  
  // In development/non-Vercel, use filesystem paths
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
  
  // If not found and we have a GridFS ID, return a special marker to retrieve from GridFS
  if (photo.gridfsId || photo.id || (photo.gridfs && photo.gridfs.id)) {
    const photoId = photo.gridfsId || photo.id || (photo.gridfs && photo.gridfs.id);
    return `gridfs:${photoId}`;
  }
  
  return null;
};

// Add footers to all pages at the end
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
};

/**
 * Embed a photo in the PDF with a caption
 */
const embedPhoto = async (doc, photo, x, y, width, height, caption) => {
  try {
    const photoPath = findPhotoPath(photo);
    
    if (photoPath) {
      // Check if it's a GridFS path
      if (photoPath.startsWith('gridfs:')) {
        const fileId = photoPath.replace('gridfs:', '');
        logger.info(`Loading photo from GridFS with ID: ${fileId}`);
        
        try {
          // Get GridFS module
          const gridfs = require('../utils/gridfs');
          
          // Create a temporary buffer to store the image data
          const chunks = [];
          
          // Get a download stream from GridFS
          const downloadStream = await gridfs.downloadFile(fileId);
          
          // Set up promise to resolve when download is complete
          await new Promise((resolve, reject) => {
            downloadStream.on('data', (chunk) => {
              chunks.push(chunk);
            });
            
            downloadStream.on('error', (error) => {
              logger.error(`Error downloading photo from GridFS: ${error.message}`);
              reject(error);
            });
            
            downloadStream.on('end', () => {
              try {
                const imageData = Buffer.concat(chunks);
                
                // Embed the image in the PDF from buffer
                doc.image(imageData, x, y, {
                  width: width,
                  height: height,
                  align: 'center',
                  valign: 'center'
                });
                
                // Add caption below photo if provided
                if (caption) {
                  const captionY = y + height + 10;
                  doc.fontSize(10).text(caption, x, captionY, { 
                    width: width, 
                    align: 'center' 
                  });
                }
                
                resolve();
              } catch (err) {
                logger.error(`Error embedding photo from GridFS: ${err.message}`);
                addMissingImagePlaceholder(doc, x, y, width, height, caption);
              }
            });
          });
        } catch (error) {
          logger.error(`Failed to embed GridFS photo: ${error.message}`);
          addMissingImagePlaceholder(doc, x, y, width, height, caption);
        }
      } else {
        // It's a local filesystem path - handle as before
        doc.image(photoPath, x, y, {
          width: width,
          height: height,
          align: 'center',
          valign: 'center'
        });
        
        // Add caption below photo if provided
        if (caption) {
          const captionY = y + height + 10;
          doc.fontSize(10).text(caption, x, captionY, { 
            width: width, 
            align: 'center' 
          });
        }
      }
    } else {
      // Add a placeholder for missing images
      addMissingImagePlaceholder(doc, x, y, width, height, caption);
    }
  } catch (error) {
    logger.error(`Error embedding photo: ${error.message}`);
    addMissingImagePlaceholder(doc, x, y, width, height, caption);
  }
};

/**
 * Add a placeholder box for missing images
 */
const addMissingImagePlaceholder = (doc, x, y, width, height, caption) => {
  // Draw a placeholder rectangle
  doc.rect(x, y, width, height)
     .lineWidth(1)
     .stroke('#cccccc');
  
  // Add text in the center of the placeholder
  doc.fontSize(12)
     .fillColor('#999999')
     .text('Image Not Available', 
           x + width/2 - 60, 
           y + height/2 - 10, 
           { width: 120, align: 'center' });
  
  // Add caption if provided
  if (caption) {
    const captionY = y + height + 10;
    doc.fontSize(10)
       .text(caption, x, captionY, { 
         width: width, 
         align: 'center' 
       });
  }
};

module.exports = {
  generatePdf
};