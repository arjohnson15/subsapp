const express = require('express');
const router = express.Router();

// Simple auth for now - can be expanded later
router.post('/login', (req, res) => {
  // For now, just return success - you can add proper auth later
  res.json({ success: true, message: 'Authenticated' });
});

router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

module.exports = router;