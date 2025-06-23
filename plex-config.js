// plex-config.js
module.exports = {
  servers: {
    'plex1': {
      regular: {
        name: 'Plex 1',
        id: '3ad72e19d4509a15d9f8253666a03efa78baac44',
        token: 'sxuautpKvoH2aZKG-j95',
        friendlyName: 'JohnsonFlix'
      },
      fourk: {
        name: 'Plex 1 4K',
        id: '90244d9a956da3afad32f85d6b24a9c24649d681',
        token: 'sxuautpKvoH2aZKG-j95',
        friendlyName: 'JohnsonFlix 4K',
        // Hardcoded 4K libraries since they never change
        libraries: [
          { id: '1', title: '4K Movies', type: 'movie' }
        ]
      }
    },
    'plex2': {
      regular: {
        name: 'Plex 2',
        id: '3ad72e19d4509a15d9f8253666a03efa78baac44',
        token: 'B1QhFRA-Q2pSm15uxmMA',
        friendlyName: 'JohnsonFlix'
      },
      fourk: {
        name: 'Plex 2 4K',
        id: 'c6448117a95874f18274f31495ff5118fd291089',
        token: 'B1QhFRA-Q2pSm15uxmMA',
        friendlyName: 'Plex 4K.',
        // Hardcoded 4K libraries since they never change
        libraries: [
          { id: '1', title: '4K Movies', type: 'movie' }
        ]
      }
    }
  },
  
  // Plex.tv API base URL
  apiBase: 'https://plex.tv/api',
  
  // Library sync interval (1 hour)
  syncInterval: 60 * 60 * 1000
};