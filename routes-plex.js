const express = require('express');
const plexService = require('../services/plexService');
const router = express.Router();

// Get all servers
router.get('/servers', async (req, res) => {
  try {
    const servers = plexService.getServerList();
    res.json(servers);
  } catch (error) {
    console.error('Error fetching servers:', error);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

// Test server connection
router.post('/servers/:name/test', async (req, res) => {
  try {
    const result = await plexService.testConnection(req.params.name);
    res.json(result);
  } catch (error) {
    console.error('Error testing connection:', error);
    res.status(500).json({ error: 'Failed to test connection' });
  }
});

// Get server libraries
router.get('/servers/:name/libraries', async (req, res) => {
  try {
    const libraries = await plexService.getLibraries(req.params.name);
    res.json(libraries);
  } catch (error) {
    console.error('Error fetching libraries:', error);
    res.status(500).json({ error: 'Failed to fetch libraries' });
  }
});

// Get server users
router.get('/servers/:name/users', async (req, res) => {
  try {
    const users = await plexService.getUsers(req.params.name);
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create user
router.post('/servers/:name/users', async (req, res) => {
  try {
    const result = await plexService.createUser(req.params.name, req.body);
    res.json(result);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user library access
router.put('/servers/:name/users/:userId/libraries', async (req, res) => {
  try {
    const { libraryIds } = req.body;
    const result = await plexService.setUserLibraryAccess(req.params.name, req.params.userId, libraryIds);
    res.json(result);
  } catch (error) {
    console.error('Error updating library access:', error);
    res.status(500).json({ error: 'Failed to update library access' });
  }
});

// Remove user
router.delete('/servers/:name/users/:userId', async (req, res) => {
  try {
    const result = await plexService.removeUser(req.params.name, req.params.userId);
    res.json(result);
  } catch (error) {
    console.error('Error removing user:', error);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

// Add server
router.post('/servers', async (req, res) => {
  try {
    const { name, url, token } = req.body;
    const result = await plexService.addServer(name, url, token);
    res.json(result);
  } catch (error) {
    console.error('Error adding server:', error);
    res.status(500).json({ error: 'Failed to add server' });
  }
});

// Sync all libraries
router.post('/sync', async (req, res) => {
  try {
    const result = await plexService.syncAllLibraries();
    res.json(result);
  } catch (error) {
    console.error('Error syncing libraries:', error);
    res.status(500).json({ error: 'Failed to sync libraries' });
  }
});

module.exports = router;