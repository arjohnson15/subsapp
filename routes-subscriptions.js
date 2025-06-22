const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const router = express.Router();

// Get all subscription types
router.get('/', async (req, res) => {
  try {
    const subscriptions = await db.query('SELECT * FROM subscription_types WHERE active = TRUE ORDER BY type, duration_months');
    res.json(subscriptions);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// Create subscription type
router.post('/', [
  body('name').notEmpty().trim(),
  body('type').isIn(['plex', 'iptv']),
  body('duration_months').isInt({ min: 1 }),
  body('price').isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, type, duration_months, streams, price } = req.body;

    const result = await db.query(`
      INSERT INTO subscription_types (name, type, duration_months, streams, price)
      VALUES (?, ?, ?, ?, ?)
    `, [name, type, duration_months, streams || null, price]);

    res.status(201).json({ message: 'Subscription type created', id: result.insertId });
  } catch (error) {
    console.error('Error creating subscription type:', error);
    res.status(500).json({ error: 'Failed to create subscription type' });
  }
});

// Update subscription type
router.put('/:id', async (req, res) => {
  try {
    const { name, type, duration_months, streams, price, active } = req.body;

    await db.query(`
      UPDATE subscription_types 
      SET name = ?, type = ?, duration_months = ?, streams = ?, price = ?, active = ?
      WHERE id = ?
    `, [name, type, duration_months, streams, price, active, req.params.id]);

    res.json({ message: 'Subscription type updated' });
  } catch (error) {
    console.error('Error updating subscription type:', error);
    res.status(500).json({ error: 'Failed to update subscription type' });
  }
});

// Delete subscription type
router.delete('/:id', async (req, res) => {
  try {
    await db.query('UPDATE subscription_types SET active = FALSE WHERE id = ?', [req.params.id]);
    res.json({ message: 'Subscription type deactivated' });
  } catch (error) {
    console.error('Error deleting subscription type:', error);
    res.status(500).json({ error: 'Failed to delete subscription type' });
  }
});

module.exports = router;