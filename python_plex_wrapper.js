// python-plex-wrapper.js - Node.js wrapper for Python Plex service
const { spawn } = require('child_process');
const path = require('path');

class PythonPlexService {
  constructor() {
    this.pythonScript = path.join(__dirname, 'plex_service.py');
    // Use Python from virtual environment in Docker, fallback to system python3
    this.pythonExecutable = process.env.NODE_ENV === 'production' 
      ? '/app/venv/bin/python' 
      : 'python3';
  }

  /**
   * Execute Python command and return parsed JSON result
   */
  async executePythonCommand(args) {
    return new Promise((resolve, reject) => {
      console.log(`🐍 Executing Python command: ${this.pythonExecutable} ${this.pythonScript} ${args.join(' ')}`);
      
      const python = spawn(this.pythonExecutable, [this.pythonScript, ...args]);
      
      let stdout = '';
      let stderr = '';
      
      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log Python info/error messages
        console.log(`🐍 Python: ${data.toString().trim()}`);
      });
      
      python.on('close', (code) => {
        if (code !== 0) {
          console.error(`❌ Python process exited with code ${code}`);
          console.error(`❌ Python stderr: ${stderr}`);
          reject(new Error(`Python process failed with code ${code}: ${stderr}`));
          return;
        }
        
        try {
          const result = JSON.parse(stdout);
          console.log(`✅ Python command completed successfully`);
          resolve(result);
        } catch (error) {
          console.error(`❌ Failed to parse Python output as JSON: ${stdout}`);
          reject(new Error(`Failed to parse Python output: ${error.message}`));
        }
      });
      
      python.on('error', (error) => {
        console.error(`❌ Failed to start Python process: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * Share libraries with a user using Python PlexAPI
   * 
   * @param {string} userEmail - User's email address
   * @param {string} serverGroup - 'plex1' or 'plex2'
   * @param {object} librarySelection - {regular: ['22', '1'], fourk: ['1']}
   * @returns {Promise<object>} Result from Python service
   */
  async shareLibrariesWithUser(userEmail, serverGroup, librarySelection) {
    try {
      console.log(`🤝 Python: Sharing libraries with ${userEmail} on ${serverGroup}`);
      console.log(`📋 Python: Library selection:`, librarySelection);
      
      const args = [
        'share_libraries',
        userEmail,
        serverGroup,
        JSON.stringify(librarySelection)
      ];
      
      const result = await this.executePythonCommand(args);
      
      console.log(`📊 Python sharing result:`, result);
      return result;
      
    } catch (error) {
      console.error(`❌ Python sharing failed:`, error);
      return {
        success: false,
        error: error.message,
        server_group: serverGroup,
        changes_made: 0
      };
    }
  }

  /**
   * Remove user from a server group using Python PlexAPI
   * 
   * @param {string} userEmail - User's email address
   * @param {string} serverGroup - 'plex1' or 'plex2'
   * @returns {Promise<object>} Result from Python service
   */
  async removeUserFromServerGroup(userEmail, serverGroup) {
    try {
      console.log(`🗑️ Python: Removing ${userEmail} from ${serverGroup}`);
      
      const args = [
        'remove_user',
        userEmail,
        serverGroup
      ];
      
      const result = await this.executePythonCommand(args);
      
      console.log(`📊 Python removal result:`, result);
      return result;
      
    } catch (error) {
      console.error(`❌ Python removal failed:`, error);
      return {
        success: false,
        error: error.message,
        server_group: serverGroup
      };
    }
  }

  /**
   * Test library update with before/after comparison
   * 
   * @param {string} userEmail - User's email address
   * @param {string} serverGroup - 'plex1' or 'plex2'
   * @param {object} librarySelection - {regular: ['22', '1'], fourk: ['1']}
   * @returns {Promise<object>} Test result from Python service
   */
  async testLibraryUpdate(userEmail, serverGroup, librarySelection) {
    try {
      console.log(`🧪 Python: Testing library update for ${userEmail} on ${serverGroup}`);
      
      const args = [
        'test_update',
        userEmail,
        serverGroup,
        JSON.stringify(librarySelection)
      ];
      
      const result = await this.executePythonCommand(args);
      
      console.log(`📊 Python test result:`, result);
      return result;
      
    } catch (error) {
      console.error(`❌ Python test failed:`, error);
      return {
        success: false,
        error: error.message,
        server_group: serverGroup
      };
    }
  }

  /**
   * Enhanced library sharing that works like the Node.js version but uses Python
   * This replaces the problematic shareLibrariesWithUserEnhanced function
   */
  async shareLibrariesWithUserEnhanced(userEmail, serverGroup, libraries) {
    try {
      console.log(`🚀 Enhanced Python sharing for ${userEmail} on ${serverGroup}`);
      console.log(`📋 Library selection:`, libraries);
      
      const result = await this.shareLibrariesWithUser(userEmail, serverGroup, libraries);
      
      // Transform result to match Node.js format
      const enhancedResult = {
        success: result.success,
        message: result.success 
          ? `Library access updated successfully (${result.changes_made} servers modified)`
          : `Library sharing failed: ${result.error}`,
        changes: result.changes_made || 0,
        results: {
          regular: result.details?.regular || { success: true, message: 'No changes needed' },
          fourk: result.details?.fourk || { success: true, message: 'No changes needed' }
        },
        currentAccess: {
          regular: libraries.regular || [],
          fourk: libraries.fourk || []
        },
        pythonResult: result
      };
      
      console.log(`✅ Enhanced Python sharing completed:`, enhancedResult);
      return enhancedResult;
      
    } catch (error) {
      console.error(`❌ Enhanced Python sharing failed:`, error);
      return {
        success: false,
        error: error.message,
        changes: 0
      };
    }
  }
}

module.exports = new PythonPlexService();