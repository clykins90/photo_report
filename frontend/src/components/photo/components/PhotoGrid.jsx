import PropTypes from 'prop-types';
import PhotoItem from './PhotoItem';

/**
 * Component for displaying photos in a grid layout
 */
const PhotoGrid = ({ photos, onRemove, onSelect, selectedPhoto }) => {
  if (!photos || photos.length === 0) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-500">No photos uploaded yet</p>
      </div>
    );
  }
  
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {photos.map((photo) => (
        <PhotoItem 
          key={photo._id || photo.clientId || photo.id || photo.preview}
          photo={photo}
          onRemove={onRemove}
          onSelect={onSelect}
          isSelected={selectedPhoto && (selectedPhoto._id === photo._id || selectedPhoto.id === photo.id)}
        />
      ))}
    </div>
  );
};

PhotoGrid.propTypes = {
  photos: PropTypes.array.isRequired,
  onRemove: PropTypes.func,
  onSelect: PropTypes.func,
  selectedPhoto: PropTypes.object
};

export default PhotoGrid; 