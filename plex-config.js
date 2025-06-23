// plex-config.js - Correct configuration with your server IPs
module.exports = {
  servers: {
    'plex1': {
      regular: {
        name: 'Plex 1',
        url: 'http://192.168.10.90:32400',
        token: 'sxuautpKvoH2aZKG-j95',
        friendlyName: 'Plex 1'
      },
      fourk: {
        name: 'Plex 1 4K',
        url: 'http://192.168.10.92:32400',
        token: 'sxuautpKvoH2aZKG-j95',
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
        url: 'http://192.168.10.94:32400',
        token: 'B1QhFRA-Q2pSm15uxmMA',
        friendlyName: 'Plex 2'
      },
      fourk: {
        name: 'Plex 2 4K',
        url: 'http://192.168.10.92:32700',
        token: 'B1QhFRA-Q2pSm15uxmMA',
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