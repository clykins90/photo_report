const fs = require('fs');
const fsPromises = fs.promises;
const OpenAI = require('openai');
const logger = require('../utils/logger');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// System prompt for photo analysis
const SYSTEM_PROMPT = `You are an expert inspector analyzing photos for a property inspection report. 
Analyze the image and provide a detailed description of what you see, focusing on:
1. What part of the property is shown
2. Any visible damage or issues
3. The severity of any problems
4. Recommendations for repair or further inspection

Format your response as JSON with the following structure: 
{
  "description": string, 
  "tags": [string], 
  "damageDetected": boolean,
  "severity": string,
  "confidence": number
}

For severity, use one of: "minor", "moderate", "severe", "critical", or "unknown".
For confidence, provide a number between 0 and 1.
For tags, include 3-5 relevant keywords that describe the key elements visible in the photo.`;

/**
 * Analyze a photo using OpenAI Vision
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<Object>} Analysis results
 */
const analyzePhoto = async (imagePath) => {
  // Start timing the function execution
  const startTime = Date.now();
  try {
    logger.info(`[TIMING] Starting photo analysis for ${imagePath} at: ${new Date().toISOString()}`);
    
    // Read image as base64
    logger.info(`[TIMING] Reading image file - elapsed: ${(Date.now() - startTime)/1000}s`);
    const imageBuffer = await fsPromises.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const imageSizeKB = Math.round(base64Image.length/1024);
    logger.info(`[TIMING] Image converted to base64 (${imageSizeKB} KB) - elapsed: ${(Date.now() - startTime)/1000}s`);
    
    // Log image size in more detail
    console.log(`[OPENAI] Image size: ${imageSizeKB} KB (${Math.round(imageSizeKB/1024 * 100) / 100} MB)`);
    
    // Call OpenAI Vision API
    console.log(`[OPENAI] 1. SENDING REQUEST TO OPENAI at ${new Date().toISOString()} - elapsed: ${(Date.now() - startTime)/1000}s`);
    logger.info(`[TIMING] Starting OpenAI API call - elapsed: ${(Date.now() - startTime)/1000}s`);
    
    const apiCallStartTime = Date.now();
    
    // Log the request details (without the actual image data)
    console.log(`[OPENAI] Request details: model=gpt-4o-mini, max_tokens=1000, response_format=json_object`);
    
    // Create the request payload
    const requestPayload = {
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
      response_format: { type: "json_object" }
    };
    
    // Make the API call
    console.log(`[OPENAI] Sending request to OpenAI API...`);
    const response = await openai.chat.completions.create(requestPayload);
    
    // Log when we received the response
    const apiCallDuration = (Date.now() - apiCallStartTime)/1000;
    console.log(`[OPENAI] 2. RECEIVED RESPONSE FROM OPENAI at ${new Date().toISOString()} - took ${apiCallDuration}s`);
    logger.info(`[TIMING] OpenAI API call completed in ${apiCallDuration}s - total elapsed: ${(Date.now() - startTime)/1000}s`);
    
    // Log response metadata
    console.log(`[OPENAI] Response metadata: model=${response.model}, prompt_tokens=${response.usage?.prompt_tokens || 'unknown'}, completion_tokens=${response.usage?.completion_tokens || 'unknown'}`);
    
    // Parse the response
    const content = response.choices[0].message.content;
    console.log(`[OPENAI] 3. STARTING ANALYSIS OF OPENAI RESPONSE at ${new Date().toISOString()} - elapsed: ${(Date.now() - startTime)/1000}s`);
    
    let analysisResult;
    
    try {
      // Extract JSON from the response
      logger.info(`[TIMING] Parsing API response - elapsed: ${(Date.now() - startTime)/1000}s`);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
        console.log(`[OPENAI] Successfully parsed JSON response`);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      logger.error(`Error parsing AI response: ${parseError.message}`);
      console.log(`[OPENAI] Failed to parse JSON response: ${parseError.message}`);
      // Fallback to a simpler structure if JSON parsing fails
      analysisResult = {
        description: content,
        tags: [],
        damageDetected: false,
        severity: "unknown",
        confidence: 0
      };
    }
    
    console.log(`[OPENAI] 3. COMPLETED ANALYSIS OF OPENAI RESPONSE at ${new Date().toISOString()} - elapsed: ${(Date.now() - startTime)/1000}s`);
    
    const totalTime = (Date.now() - startTime)/1000;
    logger.info(`[TIMING] Analysis complete for ${imagePath} - total time: ${totalTime}s (API call: ${apiCallDuration}s)`);
    
    // Add timing information to the result
    analysisResult.processingTime = {
      total: totalTime,
      apiCall: apiCallDuration,
      imageSize: imageSizeKB
    };
    
    // Log a summary of the timing
    console.log(`[OPENAI] SUMMARY: Total=${totalTime}s, API Call=${apiCallDuration}s, Image Size=${imageSizeKB}KB`);
    
    return analysisResult;
  } catch (error) {
    const errorTime = (Date.now() - startTime)/1000;
    logger.error(`Error analyzing photo: ${error.message}`);
    logger.error(`[TIMING] Error occurred at elapsed time: ${errorTime}s`);
    console.log(`[OPENAI] ERROR during OpenAI processing at ${new Date().toISOString()}: ${error.message}`);
    
    // Log more details about the error if available
    if (error.response) {
      console.log(`[OPENAI] Error status: ${error.response.status}`);
      console.log(`[OPENAI] Error data:`, error.response.data);
    }
    
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
    logger.info(`Starting batch analysis for ${photos.length} photos in report ${reportId}`);
    
    const results = [];
    const gridfs = require('../utils/gridfs');
    const path = require('path');
    const fs = require('fs');
    
    // Process photos in batches of 10
    const BATCH_SIZE = 10;
    
    // Split photos into batches
    for (let i = 0; i < photos.length; i += BATCH_SIZE) {
      const currentBatch = photos.slice(i, i + BATCH_SIZE);
      logger.info(`Processing batch ${i/BATCH_SIZE + 1} with ${currentBatch.length} photos`);
      
      // Process all photos in the current batch in parallel
      const batchPromises = currentBatch.map(async (photo) => {
        try {
          // Get the photo ID directly - no need for complex path handling
          const photoId = photo._id || photo.id;
          
          if (!photoId) {
            logger.error(`Photo does not have a valid ID`);
            return {
              photoId: photoId || 'unknown',
              success: false,
              error: 'Photo missing ID'
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
              logger.info(`Downloading GridFS file to temp path: ${tempPath}`);
              await gridfs.downloadFile(photoId, tempPath);
            } else {
              logger.info(`Using cached GridFS file at: ${tempPath}`);
            }
          } catch (downloadError) {
            logger.error(`Error downloading photo ${photoId}: ${downloadError.message}`);
            return {
              photoId: photoId,
              success: false,
              error: 'Failed to download photo file'
            };
          }
          
          if (!fs.existsSync(tempPath)) {
            logger.error(`Failed to download photo ${photoId}`);
            return {
              photoId: photoId,
              success: false,
              error: 'Photo file could not be downloaded'
            };
          }
          
          logger.info(`Analyzing photo ${photoId} at path: ${tempPath}`);
          
          // Analyze the photo
          const analysis = await analyzePhoto(tempPath);
          
          return {
            photoId: photoId,
            success: true,
            data: analysis
          };
          
        } catch (photoError) {
          const photoId = photo._id || photo.id || 'unknown';
          logger.error(`Error analyzing photo ${photoId}: ${photoError.message}`);
          return {
            photoId: photoId,
            success: false,
            error: photoError.message
          };
        }
      });
      
      // Wait for all photos in the current batch to be processed
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Add a small delay between batches to avoid overwhelming the system
      if (i + BATCH_SIZE < photos.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    logger.info(`Completed batch analysis for ${results.length} photos`);
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