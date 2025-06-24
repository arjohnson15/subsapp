const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'johnsonflix',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'johnsonflix_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
  // Removed invalid options that cause MySQL2 warnings:
  // acquireTimeout: 60000,  // NOT VALID for mysql2
  // timeout: 60000,         // NOT VALID for mysql2  
  // reconnect: true         // NOT VALID for mysql2
};

const pool = mysql.createPool(config);

class Database {
  static async query(sql, params = []) {
    try {
      const [results] = await pool.execute(sql, params);
      return results;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  static async testConnection() {
    try {
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      throw error;
    }
  }

  static async transaction(queries) {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      const results = [];
      for (const { sql, params } of queries) {
        const [result] = await connection.execute(sql, params || []);
        results.push(result);
      }
      
      await connection.commit();
      connection.release();
      return results;
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  }

  static async closePool() {
    await pool.end();
  }
}

module.exports = Database;