const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('./database-config');
const router = express.Router();

// Get all owners
router.get('/', async (req, res) => {
  try {
    const owners = await db.query(`
      SELECT o.*, COUNT(u.id) as user_count
      FROM owners o
      LEFT JOIN users u ON o.id = u.owner_id
      GROUP BY o.id
      ORDER BY o.name
    `);
    res.json(owners);
  } catch (error) {
    console.error('Error fetching owners:', error);
    res.status(500).json({ error: 'Failed to fetch owners' });
  }
});

// Create owner
router.post('/', [
  body('name').notEmpty().trim(),
  body('email').isEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email } = req.body;
    
    const result = await db.query('INSERT INTO owners (name, email) VALUES (?, ?)', [name, email]);
    res.status(201).json({ message: 'Owner created successfully', id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Error creating owner:', error);
    res.status(500).json({ error: 'Failed to create owner' });
  }
});

// Update owner
router.put('/:id', [
  body('name').notEmpty().trim(),
  body('email').isEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email } = req.body;
    
    await db.query('UPDATE owners SET name = ?, email = ? WHERE id = ?', [name, email, req.params.id]);
    res.json({ message: 'Owner updated successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Error updating owner:', error);
    res.status(500).json({ error: 'Failed to update owner' });
  }
});

// Delete owner
router.delete('/:id', async (req, res) => {
  try {
    // Check if owner has users
    const [userCount] = await db.query('SELECT COUNT(*) as count FROM users WHERE owner_id = ?', [req.params.id]);
    
    if (userCount.count > 0) {
      return res.status(400).json({ error: 'Cannot delete owner with existing users' });
    }
    
    await db.query('DELETE FROM owners WHERE id = ?', [req.params.id]);
    res.json({ message: 'Owner deleted successfully' });
  } catch (error) {
    console.error('Error deleting owner:', error);
    res.status(500).json({ error: 'Failed to delete owner' });
  }
});

module.exports = router;