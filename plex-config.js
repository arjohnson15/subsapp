// plex-config.js - Updated to use Plex.tv API with server IDs
module.exports = {
  servers: {
    'plex1': {
      regular: {
        name: 'Plex 1',
        serverId: '3ad72e19d4509a15d9f8253666a03efa78baac44',
        token: 'sxuautpKvoH2aZKG-j95',
        url: 'http://192.168.10.90:32400',
        friendlyName: 'Plex 1'
      },
      fourk: {
        name: 'Plex 1 4K',
        serverId: '90244d9a956da3afad32f85d6b24a9c24649d681',
        token: 'sxuautpKvoH2aZKG-j95',
        url: 'http://192.168.10.92:32400',
        friendlyName: 'Plex 4K 1',
        // Hardcoded 4K libraries since they never change
        libraries: [
          { id: '1', title: '4K Movies', type: 'movie' }
        ]
      }
    },
    'plex2': {
      regular: {
        name: 'Plex 2',
        serverId: '3ad72e19d4509a15d9f8253666a03efa78baac44', // Same as Plex 1 but different token
        token: 'B1QhFRA-Q2pSm15uxmMA',
        url: 'http://192.168.10.94:32400',
        friendlyName: 'Plex 2'
      },
      fourk: {
        name: 'Plex 2 4K',
        serverId: 'c6448117a95874f18274f31495ff5118fd291089',
        token: 'B1QhFRA-Q2pSm15uxmMA',
        url: 'http://192.168.10.92:32700',
        friendlyName: 'Plex 4K 2',
        // Hardcoded 4K libraries since they never change
        libraries: [
          { id: '1', title: '4K Movies', type: 'movie' }
        ]
      }
    }
  },
  
  // Library sync interval (1 hour)
  syncInterval: 60 * 60 * 1000,
  
  // Connection timeout
  timeout: 10000
};