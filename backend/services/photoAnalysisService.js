const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const logger = require('../utils/logger');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Detailed roofing inspection system prompt
const ROOFING_SYSTEM_PROMPT = `You are an expert roofing inspector with 20+ years of experience in identifying and documenting roof damage for insurance claims. Your task is to analyze roofing photographs in real-time and provide detailed, professional descriptions that will be immediately embedded into a PDF report.

CONTEXT:
- These photos are being processed temporarily and will not be stored long-term
- Your analysis needs to be comprehensive on the first pass as photos won't be available for re-analysis
- Your descriptions will be directly embedded alongside each photo in the PDF report
- Insurance adjusters will rely on your analysis to evaluate claim validity and estimate costs
- Contractors will use your observations to prepare accurate repair bids

PHOTO ANALYSIS INSTRUCTIONS:
1. First, identify the general area being shown (e.g., "Main roof slope - south facing", "Flashing around chimney", "Soffit/fascia on east elevation")
2. Describe the visible roofing materials (e.g., asphalt shingles, metal panels, tile, flashing materials)
3. Document any visible damage with specific terminology:
   - For hail damage: note impact marks, granule loss, bruising, or fracturing
   - For wind damage: identify lifted/missing shingles, creasing, or edge curling
   - For water damage: look for water staining, rot, or mold evidence
4. Rate damage severity (minor, moderate, severe) with specific measurements when possible
5. Note any secondary damage or potential complications (e.g., exposed decking, potential water infiltration)
6. Indicate whether the damage appears recent or pre-existing when possible

Format your response as JSON with the following structure: 
{
  "damageDetected": boolean, 
  "damageType": string, 
  "severity": string, 
  "location": string,
  "materials": string,
  "description": string, 
  "tags": [string], 
  "recommendedAction": string,
  "confidenceScore": number
}

For tags, include at least 3-5 relevant keywords that describe the key elements visible in the photo.

IMPORTANT GUIDELINES:
- Maintain a professional, objective tone
- Use standard roofing industry terminology
- Be precise but concise (50-100 words per analysis)
- If image quality prevents confident assessment, clearly state this limitation
- Focus only on what is objectively visible in the image
- Avoid speculating beyond what can be directly observed
- If a photo shows no damage, state this clearly rather than inventing findings
- Include relevant building code or manufacturer specification violations if visible`;

/**
 * Analyzes a photo using OpenAI's Vision API to detect damage
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<Object>} Analysis results
 */
const analyzePhoto = async (imagePath) => {
  try {
    // Read the image file as base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Add retry logic for rate limit errors
    const MAX_RETRIES = 3;
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount <= MAX_RETRIES) {
      try {
        // Call OpenAI API with the detailed roofing system prompt
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: ROOFING_SYSTEM_PROMPT
            },
            {
              role: "user",
              content: [
                { 
                  type: "text", 
                  text: "Analyze this roofing photo according to the instructions provided." 
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 1000,
          response_format: { type: "json_object" }, // Ensure JSON formatted response
        });

        // Parse the response
        const analysisText = response.choices[0].message.content;
        let analysis;
        
        try {
          // Parse the JSON response
          analysis = JSON.parse(analysisText);
          
          // Ensure tags is always an array
          if (!analysis.tags || !Array.isArray(analysis.tags)) {
            analysis.tags = [];
          } else if (typeof analysis.tags === 'string') {
            // If it's a string, convert to array
            analysis.tags = analysis.tags.split(',').map(tag => tag.trim());
          }
          
          // Set default values for any missing fields
          analysis = {
            damageDetected: analysis.damageDetected || false,
            damageType: analysis.damageType || null,
            severity: analysis.severity || null,
            location: analysis.location || 'Unknown location',
            materials: analysis.materials || 'Not specified',
            description: analysis.description || 'No description available',
            tags: analysis.tags,
            recommendedAction: analysis.recommendedAction || 'No recommendations provided',
            confidenceScore: analysis.confidenceScore || 0.5
          };
          
        } catch (parseError) {
          logger.error(`Failed to parse OpenAI response: ${parseError.message}`);
          // Fallback to a default structure if parsing fails
          analysis = {
            damageDetected: false,
            damageType: null,
            severity: null,
            location: 'Unknown location',
            materials: 'Not specified',
            description: "Failed to analyze image automatically. Please add a manual description.",
            tags: [],
            recommendedAction: 'Manual inspection required',
            confidenceScore: 0
          };
        }

        return analysis;
        
      } catch (error) {
        lastError = error;
        
        // Check if it's a rate limit error (429)
        if (error.status === 429 || (error.message && error.message.includes('429'))) {
          retryCount++;
          
          if (retryCount <= MAX_RETRIES) {
            // Calculate delay with exponential backoff
            const delay = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
            logger.warn(`Rate limit hit for photo analysis, retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`);
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            logger.error(`Failed to analyze photo after ${MAX_RETRIES} retries due to rate limits`);
            throw new Error(`Rate limit exceeded after ${MAX_RETRIES} retries. Please try again later.`);
          }
        } else {
          // For other errors, don't retry
          logger.error(`Error analyzing photo: ${error.message}`);
          throw error;
        }
      }
    }
    
    // This should not be reached due to the throw in the last iteration of the loop
    throw lastError || new Error('Failed to analyze photo after multiple attempts');
  } catch (error) {
    logger.error(`Error analyzing photo: ${error.message}`);
    throw new Error(`Failed to analyze photo: ${error.message}`);
  }
};

/**
 * Analyzes multiple photos in a batch using OpenAI's Vision API
 * @param {Array<string>} imagePaths - Array of paths to image files
 * @returns {Promise<Array<Object>>} Array of analysis results
 */
const analyzeBatchPhotos = async (imagePaths) => {
  if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length === 0) {
    throw new Error('No valid image paths provided for batch analysis');
  }

  const results = [];

  try {
    // Process all photos in the batch in parallel
    // The frontend is already sending batches of 5, so we don't need to re-chunk them
    logger.info(`Processing batch of ${imagePaths.length} photos directly (frontend already batched)`);
    
    // Process photos in this batch in parallel
    const batchPromises = imagePaths.map(async (imagePath) => {
      try {
        // Add retry logic with exponential backoff
        const MAX_RETRIES = 3;
        let retryCount = 0;
        let lastError = null;
        
        while (retryCount < MAX_RETRIES) {
          try {
            const analysis = await analyzePhoto(imagePath);
            return {
              imagePath,
              success: true,
              data: analysis
            };
          } catch (error) {
            lastError = error;
            
            // Check if it's a rate limit error (429)
            if (error.message && error.message.includes('429')) {
              retryCount++;
              const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s
              logger.warn(`Rate limit hit, retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              // For non-rate-limit errors, don't retry
              break;
            }
          }
        }
        
        // If we get here, all retries failed
        logger.error(`Error analyzing photo ${imagePath} after ${retryCount} retries: ${lastError.message}`);
        return {
          imagePath,
          success: false,
          error: lastError.message
        };
      } catch (error) {
        logger.error(`Error analyzing photo ${imagePath}: ${error.message}`);
        return {
          imagePath,
          success: false,
          error: error.message
        };
      }
    });
    
    // Wait for all photos in this batch to complete
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    return results;
  } catch (error) {
    logger.error(`Error in batch photo analysis: ${error.message}`);
    throw new Error(`Failed to complete batch photo analysis: ${error.message}`);
  }
};

module.exports = {
  analyzePhoto,
  analyzeBatchPhotos
}; 