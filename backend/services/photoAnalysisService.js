// const fs = require('fs');
const OpenAI = require('openai');
const logger = require('../utils/logger');
const gridfs = require('../utils/gridfs');
// const path = require('path');

// Constants for retry logic
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

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

When analyzing multiple photos, provide your response as a JSON object with an "analyses" array containing an analysis object for each photo.

**CRITICAL REQUIREMENT FOR BATCH ANALYSIS:** Each individual analysis object within the 'analyses' array **MUST** include a 'photoId' field. The value of this field **MUST** be the exact ID string provided in the input prompt for that specific photo (e.g., 'ID: 65f...'). **This 'photoId' is essential for us to correctly map your analysis back to the original photo.** Failure to include the correct 'photoId' for every analysis object will render the response unusable.

The overall structure for a batch response **MUST** be:
{
  "analyses": [
    {
      "photoId": "The exact ID provided in the text prompt for this specific photo. MANDATORY field.", 
      "description": "A detailed paragraph describing what's in the photo and its condition",
      "tags": ["tag1", "tag2", "tag3"],
      "damageDetected": false,
      "severity": "unknown",
      "confidence": 0.8
    },
    // More photo analyses, EACH containing a 'photoId'...
  ]
}
`;

/**
 * Analyze multiple photos in one batch request
 * @param {Array<Object>} imageData - Array of objects with { id: string, base64: string }
 * @returns {Promise<Array<Object>>} - Array of analysis results, mapped by id
 */
const analyzeBatchPhotos = async (imageData) => {
  logger.info(`Starting batch analysis for ${imageData.length} photos`);
  let lastError = null;
  let response = null;

  // Create content array once before the retry loop
  const content = [
    {
      type: "text",
      text: `Analyze these ${imageData.length} photos for a property inspection report. Provide a separate analysis for each photo.`
    }
  ];
  imageData.forEach((imgData, index) => {
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${imgData.base64}` }
    });
    if (index < imageData.length - 1) {
      content.push({
        type: "text",
        text: `This was photo #${index + 1} (ID: ${imgData.id}). Now analyzing photo #${index + 2} (ID: ${imageData[index + 1].id}):`
      });
    }
  });

  // Retry loop for OpenAI API call
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      logger.info(`Attempt ${attempt + 1} of ${MAX_RETRIES} for OpenAI batch analysis for IDs: ${imageData.map(d => d.id).join(', ')}`);
      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: content }
        ],
        max_tokens: 2000,
        temperature: 0.7,
        response_format: { type: "json_object" }
      });
      // If successful, break the loop
      lastError = null;
      logger.info(`OpenAI API call successful on attempt ${attempt + 1}`);
      break;
    } catch (error) {
      lastError = error;
      logger.warn(`OpenAI API call attempt ${attempt + 1} failed: ${error.message}`);

      // Check if the error is retryable (rate limits, server errors)
      const isRetryable = error.status === 429 || error.status >= 500;

      if (isRetryable && attempt < MAX_RETRIES - 1) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        logger.info(`Retryable error detected (status: ${error.status}). Waiting ${delay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Non-retryable error or max retries reached
        logger.error(`Non-retryable error or max retries reached for OpenAI call. Error status: ${error.status}`);
        break; // Exit loop, response will remain null
      }
    }
  }

  // If all retries failed, return failure for the batch
  if (!response) {
    logger.error(`OpenAI API call failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown API error'}`);
    return imageData.map(imgData => ({
      id: imgData.id,
      success: false,
      error: `OpenAI API call failed after retries: ${lastError?.message || 'Unknown API error'}`
    }));
  }

  // --- Process the successful response --- //
  try {
    const responseContent = response.choices[0].message.content;
    const parsedResponse = JSON.parse(responseContent);

    // --- BEGIN ADDED LOGGING ---
    logger.debug(`Raw OpenAI parsed response: ${JSON.stringify(parsedResponse, null, 2)}`); 
    // --- END ADDED LOGGING ---

    // Extract analyses array
    let analyses = [];
    if (parsedResponse.analyses && Array.isArray(parsedResponse.analyses)) {
      analyses = parsedResponse.analyses;
    } else {
       logger.warn(`AI response missing or invalid 'analyses' array. Raw content: ${responseContent}`);
       // Attempt to handle potential single object response if applicable, otherwise fail
       if (typeof parsedResponse === 'object' && !Array.isArray(parsedResponse) && parsedResponse.photoId) {
         analyses = [parsedResponse]; // Treat as a single analysis if it has photoId
       } else {
         // If it's not a valid single response either, return error for all
         throw new Error("AI response missing or invalid 'analyses' array");
       }
    }

    logger.info(`Successfully parsed batch response. Expected: ${imageData.length}, Received: ${analyses.length} analysis objects in array`);

    // Create a map for results based on photoId from the AI response
    const analysisMap = {};
    analyses.forEach(analysis => {
      if (analysis && analysis.photoId) {
        if (analysisMap[analysis.photoId]) {
           logger.warn(`Duplicate photoId '${analysis.photoId}' received in AI response. Overwriting previous analysis.`);
        }
        analysisMap[analysis.photoId] = analysis;
      } else {
        logger.warn(`AI analysis result missing photoId or invalid format: ${JSON.stringify(analysis)}`);
      }
    });

    // --- BEGIN ADDED LOGGING ---
    logger.debug(`Analysis map created with keys: ${Object.keys(analysisMap).join(', ')}`);
    // --- END ADDED LOGGING ---

    // Map results back to the original photo IDs using the analysisMap
    return imageData.map(imgData => {
      const analysis = analysisMap[imgData.id];
      if (analysis) {
        // --- BEGIN ADDED LOGGING ---
        logger.debug(`Successfully mapped analysis for photo ID ${imgData.id}`);
        // --- END ADDED LOGGING ---
        return {
          id: imgData.id,
          success: true,
          data: analysis // Includes photoId from AI
        };
      } else {
        const errorMessage = "Analysis missing in AI batch response for this ID";
        logger.error(`Analysis missing for photo ID ${imgData.id}. Check AI response structure and photoId content.`);
        // --- BEGIN ADDED LOGGING ---
        logger.warn(`Failed mapping analysis for photo ID ${imgData.id}. Expected ID in analysisMap.`);
        // --- END ADDED LOGGING ---
        return {
          id: imgData.id,
          success: false,
          error: errorMessage
          // No need for default data structure here, caller handles undefined data on failure
        };
      }
    });

  } catch (error) {
    // Catch errors during response parsing or mapping
    logger.error(`Error processing OpenAI response: ${error.message}`);
    logger.debug(`Raw response content (if available): ${response?.choices[0]?.message?.content || 'N/A'}`);
    // Return failure for all photos in the batch due to processing error
    return imageData.map(imgData => ({
      id: imgData.id,
      success: false,
      error: `Failed to process OpenAI response: ${error.message}`
    }));
  }
};

/**
 * Analyze multiple photos from a report by streaming from GridFS
 * @param {Array<String>} photoIds - Array of photo IDs (as strings)
 * @param {String} reportId - The report ID these photos belong to
 * @returns {Promise<Array<Object>>} - Array of analysis results with photoId and analysis data/error
 */
const analyzePhotos = async (photoIds, reportId) => {
  try {
    logger.info(`Starting analysis for ${photoIds.length} photos in report ${reportId}`);

    const results = [];

    // Process photos in batches
    const BATCH_SIZE = 10;

    for (let i = 0; i < photoIds.length; i += BATCH_SIZE) {
      const currentBatchIds = photoIds.slice(i, i + BATCH_SIZE);
      logger.info(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1} with ${currentBatchIds.length} photo IDs`);

      // Fetch photo data directly into buffers for the batch
      const fetchResults = await Promise.all(currentBatchIds.map(async (photoId) => {
        if (!photoId) {
          logger.warn('Null or empty photo ID found in batch analysis request');
          return {
            photoId: 'unknown',
            success: false,
            error: 'Null or empty photo ID'
          };
        }

        try {
          // Use gridfs utility to stream file content to a buffer
          const buffer = await gridfs.downloadFile(photoId);
          const base64String = buffer.toString('base64');
          logger.debug(`Successfully fetched buffer and converted to base64 for photo ${photoId}`);
          return {
            photoId: photoId,
            success: true,
            base64: base64String
          };
        } catch (fetchError) {
          logger.error(`Error fetching photo ${photoId} from GridFS: ${fetchError.message}`);
          return {
            photoId: photoId,
            success: false,
            error: `Failed to fetch photo data: ${fetchError.message}`
          };
        }
      }));

      // Filter out successfully fetched photos
      const successfulFetches = fetchResults.filter(result => result.success && result.base64);
      const failedFetches = fetchResults.filter(result => !result.success);

      // Add failures for this batch to the main results array immediately
      if (failedFetches.length > 0) {
        results.push(...failedFetches.map(result => ({
          photoId: result.photoId,
          success: false,
          error: result.error || 'Failed to fetch photo data'
        })));
      }

      if (successfulFetches.length === 0) {
        logger.warn(`No photos could be fetched for batch ${Math.floor(i/BATCH_SIZE) + 1}. Skipping analysis for this batch.`);
        continue;
      }

      try {
        // Prepare data for batch analysis { id, base64 }
        const batchImageData = successfulFetches.map(result => ({
          id: result.photoId,
          base64: result.base64
        }));

        // Process entire batch in one request using the modified analyzeBatchPhotos
        const batchAnalysisResults = await analyzeBatchPhotos(batchImageData);

        // Map results back to photo IDs
        results.push(...batchAnalysisResults.map(analysisResult => ({
          photoId: analysisResult.id,
          success: analysisResult.success,
          data: analysisResult.success ? analysisResult.data : undefined,
          error: !analysisResult.success ? analysisResult.error : undefined
        })));

      } catch (batchError) {
        logger.error(`Error processing batch ${Math.floor(i/BATCH_SIZE) + 1} after fetching: ${batchError.message}`);

        results.push(...successfulFetches.map(result => ({
          photoId: result.photoId,
          success: false,
          error: batchError.message || 'Batch analysis failed unexpectedly'
        })));
      }

      if (i + BATCH_SIZE < photoIds.length) {
        logger.debug(`Waiting 1 second before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info(`Completed analysis process for report ${reportId}. Total results: ${results.length}`);
    return results;

  } catch (error) {
    logger.error(`Fatal error in analyzePhotos for report ${reportId}: ${error.message}`);
    // Fallback: Map over the input IDs
    return photoIds.map(photoId => ({
      photoId: photoId || 'unknown', // Use the ID directly
      success: false,
      error: `Service level error: ${error.message}`
    }));
  }
};

module.exports = {
  analyzePhotos
}; 