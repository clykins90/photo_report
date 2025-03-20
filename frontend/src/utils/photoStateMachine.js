// Define all possible states
export const PhotoState = {
  INITIAL: 'initial',        // Just added to the UI
  PENDING: 'pending',        // Ready to be uploaded
  UPLOADING: 'uploading',    // Currently being uploaded
  UPLOADED: 'uploaded',      // Successfully uploaded to server
  ANALYZING: 'analyzing',    // Being analyzed by AI
  ANALYZED: 'analyzed',      // Analysis complete
  ERROR: 'error'            // Error in any state
};

// Define valid transitions between states
const stateTransitions = {
  [PhotoState.INITIAL]: [PhotoState.PENDING, PhotoState.ERROR],
  [PhotoState.PENDING]: [PhotoState.UPLOADING, PhotoState.ERROR],
  [PhotoState.UPLOADING]: [PhotoState.UPLOADED, PhotoState.ERROR],
  [PhotoState.UPLOADED]: [PhotoState.ANALYZING, PhotoState.ERROR],
  [PhotoState.ANALYZING]: [PhotoState.ANALYZED, PhotoState.ERROR],
  [PhotoState.ANALYZED]: [PhotoState.ERROR], // Can only go to error from analyzed
  [PhotoState.ERROR]: [PhotoState.PENDING]   // Can retry from error
};

// Define what data should be present in each state
const stateValidators = {
  [PhotoState.INITIAL]: (photo) => !!photo.file && !!photo.clientId,
  [PhotoState.PENDING]: (photo) => !!photo.file && !!photo.clientId,
  [PhotoState.UPLOADING]: (photo) => !!photo.file && !!photo.clientId && typeof photo.uploadProgress === 'number',
  [PhotoState.UPLOADED]: (photo) => !!photo._id,
  [PhotoState.ANALYZING]: (photo) => !!photo._id,
  [PhotoState.ANALYZED]: (photo) => !!photo._id && !!photo.analysis,
  [PhotoState.ERROR]: (photo) => !!photo.error
};

class PhotoStateMachine {
  constructor(initialState = PhotoState.INITIAL) {
    this.currentState = initialState;
  }

  // Check if a transition is valid
  canTransition(fromState, toState) {
    const validTransitions = stateTransitions[fromState];
    return validTransitions?.includes(toState);
  }

  // Attempt to transition to a new state
  transition(photo, newState) {
    // Check if the transition is valid
    if (!this.canTransition(photo.status, newState)) {
      throw new Error(
        `Invalid state transition from ${photo.status} to ${newState}`
      );
    }

    // Validate the photo data for the new state
    const isValid = stateValidators[newState](photo);
    if (!isValid) {
      throw new Error(
        `Photo data invalid for state ${newState}`
      );
    }

    // Return new photo object with updated state
    return {
      ...photo,
      status: newState,
      lastTransition: new Date().toISOString()
    };
  }

  // Helper method to check if a photo is in a specific state
  isInState(photo, state) {
    return photo.status === state;
  }

  // Helper method to check if a photo can be uploaded
  canUpload(photo) {
    return this.canTransition(photo.status, PhotoState.UPLOADING);
  }

  // Helper method to check if a photo can be analyzed
  canAnalyze(photo) {
    return this.canTransition(photo.status, PhotoState.ANALYZING);
  }

  // Get all possible next states
  getNextPossibleStates(currentState) {
    return stateTransitions[currentState] || [];
  }

  // Validate entire photo object
  validatePhoto(photo) {
    if (!photo.status) {
      return { valid: false, error: 'Photo has no status' };
    }

    const validator = stateValidators[photo.status];
    if (!validator) {
      return { valid: false, error: `Unknown state: ${photo.status}` };
    }

    const isValid = validator(photo);
    return {
      valid: isValid,
      error: isValid ? null : `Invalid photo data for state ${photo.status}`
    };
  }
}

// Create and export a singleton instance
export const photoStateMachine = new PhotoStateMachine();

// Export a function to create new photo objects
export const createNewPhoto = (file) => {
  const clientId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  return {
    clientId,
    file,
    preview: URL.createObjectURL(file),
    status: PhotoState.INITIAL,
    name: file.name,
    type: file.type,
    size: file.size,
    uploadProgress: 0,
    createdAt: new Date().toISOString()
  };
}; 