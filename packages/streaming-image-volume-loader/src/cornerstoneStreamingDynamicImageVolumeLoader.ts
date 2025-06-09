import { getVolumeInfo, splitImageIdsBy4DTags } from './helpers';
import StreamingDynamicImageVolume from './StreamingDynamicImageVolume';

interface IVolumeLoader {
  promise: Promise<StreamingDynamicImageVolume>;
  cancel: () => void;
  decache: () => void;
}

function get4DVolumeInfo(imageIds: string[]) {
  const { imageIdsGroups, splittingTag } = splitImageIdsBy4DTags(imageIds);
  return {
    volumesInfo: imageIdsGroups.map((imageIds) => getVolumeInfo(imageIds)),
    splittingTag,
  };
}

/**
 * It handles loading of a image by streaming in its imageIds. It will be the
 * volume loader if the schema for the volumeID is `cornerstoneStreamingImageVolume`.
 * This function returns a promise that resolves to the StreamingDynamicImageVolume instance.
 *
 * In order to use the cornerstoneStreamingDynamicImageVolumeLoader you should use
 * createAndCacheVolume helper from the cornerstone-core volumeLoader module.
 *
 * @param volumeId - The ID of the volume
 * @param options - options for loading, imageIds
 * @returns a promise that resolves to a StreamingDynamicImageVolume
 */
function cornerstoneStreamingDynamicImageVolumeLoader(
  volumeId: string,
  options: {
    imageIds: string[];
    scalarDataIndex?: number;
  }
): IVolumeLoader {
  if (!options || !options.imageIds || !options.imageIds.length) {
    throw new Error(
      'ImageIds must be provided to create a 4D streaming image volume'
    );
  }

  const { imageIds } = options;
  const { volumesInfo, splittingTag } = get4DVolumeInfo(imageIds);

  const {
    metadata: volumeMetadata,
    dimensions,
    spacing,
    origin,
    direction,
    sizeInBytes,
  } = volumesInfo[0];

  const sortedImageIdsArrays = [];
  const scalarDataArrays = [];

  volumesInfo.forEach((volumeInfo) => {
    sortedImageIdsArrays.push(volumeInfo.sortedImageIds);
    scalarDataArrays.push(volumeInfo.scalarData);
  });
  const sortedImageIds = sortedImageIdsArrays.flat();
  if (
    options.scalarDataIndex &&
    options.scalarDataIndex > 0 &&
    scalarDataArrays.length > options.scalarDataIndex
  ) {
    const temp = scalarDataArrays[options.scalarDataIndex];
    scalarDataArrays[options.scalarDataIndex] = scalarDataArrays[0];
    scalarDataArrays[0] = temp;
    const numGroup = Math.round(
      sortedImageIds.length / scalarDataArrays.length
    );
    let pos = options.scalarDataIndex * numGroup;
    let tid = '';
    for (let i = 0; i < numGroup; i++) {
      tid = sortedImageIds[pos];
      sortedImageIds[pos] = sortedImageIds[i];
      sortedImageIds[i] = tid;
      pos++;
    }
  }

  let streamingImageVolume = new StreamingDynamicImageVolume(
    // ImageVolume properties
    {
      volumeId,
      metadata: volumeMetadata,
      dimensions,
      spacing,
      origin,
      direction,
      scalarData: scalarDataArrays,
      sizeInBytes,
      imageIds: sortedImageIds,
      splittingTag,
    },
    // Streaming properties
    {
      imageIds: sortedImageIds,
      loadStatus: {
        // todo: loading and loaded should be on ImageVolume
        loaded: false,
        loading: false,
        cancelled: false,
        cachedFrames: [],
        callbacks: [],
      },
    }
  );

  return {
    promise: Promise.resolve(streamingImageVolume),
    decache: () => {
      streamingImageVolume.destroy();
      streamingImageVolume = null;
    },
    cancel: () => {
      streamingImageVolume.cancelLoading();
    },
  };
}

export default cornerstoneStreamingDynamicImageVolumeLoader;
