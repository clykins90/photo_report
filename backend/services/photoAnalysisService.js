const fs = require('fs');
const fsPromises = fs.promises;
const OpenAI = require('openai');
const logger = require('../utils/logger');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// System prompt for photo analysis
const SYSTEM_PROMPT = `You are an expert property inspector analyzing photos for a property inspection report. 
Your task is to analyze the image and provide a detailed description with the following information:

1. What part of the property is shown (e.g., roof, siding, foundation, kitchen, bathroom)
2. Any visible damage, issues, or defects you can identify
3. The severity of any problems you observe
4. Key materials visible in the image (e.g., asphalt shingles, vinyl siding, drywall)

IMPORTANT: You MUST always provide a detailed description of what you see, even if there is no damage. Focus on describing the condition, materials, and features visible in the photo.

Format your response as JSON with this EXACT structure: 
{
  "description": "A detailed paragraph describing what's in the photo and its condition",
  "tags": ["tag1", "tag2", "tag3"],
  "damageDetected": false,
  "severity": "unknown",
  "confidence": 0.8
}

For tags: Always include 3-5 relevant keywords that describe what's in the image
For damageDetected: Use true ONLY if you can see actual damage, otherwise false
For severity: Use "minor", "moderate", "severe", "critical", or "unknown" (use "unknown" when no damage)
For confidence: Provide a number between 0.5 and 1.0 indicating your confidence

ALWAYS provide a description and tags, even for normal features with no damage.

When analyzing multiple photos, provide your response as a JSON object with an "analyses" array containing an analysis object for each photo:
{
  "analyses": [
    {
      "description": "A detailed paragraph describing what's in the photo and its condition",
      "tags": ["tag1", "tag2", "tag3"],
      "damageDetected": false,
      "severity": "unknown",
      "confidence": 0.8
    },
    // More photo analyses...
  ]
}`;

/**
 * Analyze a photo using OpenAI Vision
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<Object>} Analysis results
 */
const analyzePhoto = async (imagePath) => {
  try {
    logger.info(`Starting photo analysis for ${imagePath}`);
    
    // Read image as base64
    const imageBuffer = await fsPromises.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    // Call OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this photo for a property inspection report." },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    // Parse the response
    const content = response.choices[0].message.content;
    
    try {
      // Properly parse the JSON response
      const parsedResponse = JSON.parse(content);
      
      // Extract the analysis - look for either direct object or first item in analyses array
      const analysisResult = parsedResponse.analyses?.[0] || parsedResponse;
      
      logger.info(`Successfully analyzed photo ${imagePath}`);
      
      // Return the analysis result
      return { 
        success: true,
        data: analysisResult 
      };
    } catch (parseError) {
      logger.error(`Error parsing AI response: ${parseError.message}`);
      throw new Error(`Failed to parse AI response: ${parseError.message}`);
    }
  } catch (error) {
    logger.error(`Error analyzing photo: ${error.message}`);
    throw error;
  }
};

/**
 * Analyze multiple photos in one batch request
 * @param {Array<string>} imagePaths - Array of paths to image files
 * @returns {Promise<Array<Object>>} - Array of analysis results
 */
const analyzeBatchPhotos = async (imagePaths) => {
  try {
    logger.info(`Starting batch analysis for ${imagePaths.length} photos`);
    
    // Read all images as base64
    const imagePromises = imagePaths.map(async (path) => {
      const imageBuffer = await fsPromises.readFile(path);
      return {
        path,
        base64: imageBuffer.toString('base64')
      };
    });
    
    const images = await Promise.all(imagePromises);
    
    // Create content array with all images
    const content = [
      { 
        type: "text", 
        text: `Analyze these ${images.length} photos for a property inspection report. Provide a separate analysis for each photo.` 
      }
    ];
    
    // Add each image to the content array
    images.forEach((img, index) => {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${img.base64}`
        }
      });
      
      // Add a separator text between images
      if (index < images.length - 1) {
        content.push({
          type: "text",
          text: `This was photo #${index + 1}. Now analyzing photo #${index + 2}:`
        });
      }
    });
    
    // Call OpenAI Vision API with all images
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: content
        }
      ],
      max_tokens: 2000,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });
    
    // Parse the response
    const responseContent = response.choices[0].message.content;
    
    try {
      // Parse the JSON response
      const parsedResponse = JSON.parse(responseContent);
      
      // Extract analyses array or create array from single result
      let analyses = [];
      if (parsedResponse.analyses && Array.isArray(parsedResponse.analyses)) {
        analyses = parsedResponse.analyses;
      } else if (parsedResponse.results && Array.isArray(parsedResponse.results)) {
        analyses = parsedResponse.results;
      } else {
        // If no array is found, use the whole response as a single result
        analyses = [parsedResponse];
      }
      
      logger.info(`Successfully parsed batch response with ${analyses.length} results`);
      
      // Return results mapped to image paths
      return images.map((img, index) => {
        return {
          path: img.path,
          success: true,
          data: index < analyses.length ? analyses[index] : {
            description: "No analysis available for this image",
            tags: ["missing", "analysis", "error"],
            damageDetected: false,
            severity: "unknown",
            confidence: 0.5
          }
        };
      });
    } catch (parseError) {
      logger.error(`Error parsing batch response: ${parseError.message}`);
      throw new Error(`Failed to parse batch response: ${parseError.message}`);
    }
  } catch (error) {
    logger.error(`Error in batch analysis: ${error.message}`);
    throw error;
  }
};

/**
 * Analyze multiple photos from a report
 * @param {Array<Object>} photos - Array of photo objects to analyze
 * @param {String} reportId - The report ID these photos belong to
 * @returns {Promise<Array<Object>>} - Array of analysis results with photoId and analysis data
 */
const analyzePhotos = async (photos, reportId) => {
  try {
    logger.info(`Starting analysis for ${photos.length} photos in report ${reportId}`);
    
    const results = [];
    const gridfs = require('../utils/gridfs');
    const path = require('path');
    
    // Process photos in batches of 10
    const BATCH_SIZE = 10;
    
    // Split photos into batches
    for (let i = 0; i < photos.length; i += BATCH_SIZE) {
      const currentBatch = photos.slice(i, i + BATCH_SIZE);
      logger.info(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1} with ${currentBatch.length} photos`);
      
      // Download all photos in the batch first
      const downloadResults = await Promise.all(currentBatch.map(async (photo) => {
        try {
          const photoId = photo._id || photo.id;
          
          if (!photoId) {
            return {
              photoId: 'unknown',
              success: false,
              error: 'Photo missing ID',
              tempPath: null
            };
          }
          
          // Create a temporary path for the photo file
          const tempDir = process.env.TEMP_DIR || '/tmp';
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          
          const tempPath = path.join(tempDir, `photo_${photoId}.jpg`);
          
          // Download the file directly from GridFS using the ID
          try {
            // Check if we need to download the file
            if (!fs.existsSync(tempPath)) {
              await gridfs.downloadFile(photoId, tempPath);
            }
          } catch (downloadError) {
            logger.error(`Error downloading photo ${photoId}: ${downloadError.message}`);
            return {
              photoId: photoId,
              success: false,
              error: 'Failed to download photo file',
              tempPath: null
            };
          }
          
          if (!fs.existsSync(tempPath)) {
            return {
              photoId: photoId,
              success: false,
              error: 'Photo file could not be downloaded',
              tempPath: null
            };
          }
          
          return {
            photoId: photoId,
            success: true,
            tempPath: tempPath
          };
        } catch (error) {
          const photoId = photo._id || photo.id || 'unknown';
          logger.error(`Error preparing photo ${photoId}: ${error.message}`);
          return {
            photoId: photoId,
            success: false,
            error: error.message,
            tempPath: null
          };
        }
      }));
      
      // Filter out successful downloads
      const successfulDownloads = downloadResults.filter(result => result.success && result.tempPath);
      
      if (successfulDownloads.length === 0) {
        logger.error(`No photos could be downloaded for batch ${Math.floor(i/BATCH_SIZE) + 1}`);
        results.push(...downloadResults.map(result => ({
          photoId: result.photoId,
          success: false,
          error: result.error || 'Failed to download photo'
        })));
        continue;
      }
      
      try {
        // Get array of image paths
        const imagePaths = successfulDownloads.map(result => result.tempPath);
        
        // Process entire batch in one request
        const batchAnalysisResults = await analyzeBatchPhotos(imagePaths);
        
        // Map results back to photo IDs
        const mappedResults = successfulDownloads.map((download, index) => {
          const analysisResult = batchAnalysisResults.find(r => r.path === download.tempPath);
          
          if (analysisResult && analysisResult.success) {
            return {
              photoId: download.photoId,
              success: true,
              data: analysisResult.data
            };
          } else {
            return {
              photoId: download.photoId,
              success: false,
              error: 'Failed to analyze photo'
            };
          }
        });
        
        results.push(...mappedResults);
        
        // Add failed downloads to results
        const failedDownloads = downloadResults.filter(result => !result.success);
        results.push(...failedDownloads.map(result => ({
          photoId: result.photoId,
          success: false,
          error: result.error || 'Failed to download photo'
        })));
        
      } catch (batchError) {
        logger.error(`Error processing batch ${Math.floor(i/BATCH_SIZE) + 1}: ${batchError.message}`);
        
        // Mark all photos in this batch as failed
        results.push(...downloadResults.map(result => ({
          photoId: result.photoId,
          success: false,
          error: batchError.message || 'Batch analysis failed'
        })));
      }
      
      // Add a small delay between batches
      if (i + BATCH_SIZE < photos.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    logger.info(`Completed analysis for ${results.length} photos`);
    return results;
    
  } catch (error) {
    logger.error(`Error in analyzePhotos: ${error.message}`);
    throw error;
  }
};

module.exports = {
  analyzePhoto,
  analyzePhotos
}; 