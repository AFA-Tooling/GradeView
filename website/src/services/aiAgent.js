// src/services/aiAgent.js
/**
 * AI Agent Service - Universal Version
 * Agent capabilities:
 * 1. Understand database schema
 * 2. Dynamically generate SQL from natural language
 * 3. Execute queries and return results
 * 4. Use AI to explain results
 */

class AIAgent {
  constructor() {
    this.apiKey = ''; // API key (read from environment variables)
    this.conversationHistory = [];
    this.initialized = false;
    this.databaseSchema = null;
  }

  /**
   * Initialize AI Agent
   * @param {string} apiKey - AI service API key (optional, environment variable takes priority)
   */
  async initialize(apiKey = '') {
    this.apiKey = apiKey || process.env.REACT_APP_OPENAI_API_KEY || '';
    this.initialized = true;
    
    // Fetch database schema
    try {
      await this.fetchDatabaseSchema();
      console.log('AI Agent initialized with database schema');
    } catch (error) {
      console.warn('Failed to fetch database schema:', error);
      console.log('AI Agent initialized in basic mode');
    }
  }

  /**
   * Fetch Database Schema Information
   */
  async fetchDatabaseSchema() {
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('No auth token, skipping schema fetch');
      return;
    }

    try {
      const response = await fetch('/api/v2/admin/ai-query/schema', {
        method: 'GET',
        headers: {
          'Authorization': token
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.databaseSchema = data.schema;
        console.log('Database schema loaded:', this.databaseSchema);
      }
    } catch (error) {
      console.error('Failed to fetch schema:', error);
    }
  }

  /**
   * Process Query - Main Entry Point
   * @param {string} query - User's natural language query
   * @returns {Promise<object>} - Query results
   */
  async processQuery(query) {
    console.log(`[AI Agent] Processing query: "${query}"`);

    // Add to conversation history
    this.conversationHistory.push({
      role: 'user',
      content: query,
      timestamp: new Date().toISOString()
    });

    let response;
    
    try {
      // Call backend API (AI will dynamically generate SQL)
      response = await this.queryBackend(query);
      console.log('[AI Agent] Query successful:', response);
    } catch (error) {
      console.error('[AI Agent] Query failed:', error);
      // Return error response
      response = {
        type: 'error',
        answer: `Query failed: ${error.message}`,
        data: null,
        suggestions: ['Please check the query content', 'Ensure you are logged in', 'Try a simpler query'],
        visualizationType: 'text'
      };
    }

    // Add to conversation history
    this.conversationHistory.push({
      role: 'assistant',
      content: response.answer,
      timestamp: new Date().toISOString(),
      data: response.data
    });

    return response;
  }

  /**
   * Call Backend API for Querying
   * Backend will use AI to generate SQL and execute
   * @param {string} query - User query
   * @returns {Promise<object>} - API response
   */
  async queryBackend(query) {
    // Get authentication token from localStorage
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Please login to admin account first');
    }

    const response = await fetch('/api/v2/admin/ai-query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token
      },
      body: JSON.stringify({
        query: query,
        useAI: !!this.apiKey  // Use AI if API key exists, otherwise use rules
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Get Database Schema (for UI display)
   */
  getDatabaseSchema() {
    return this.databaseSchema;
  }

  /**
   * Get Conversation History
   */
  getConversationHistory() {
    return this.conversationHistory;
  }

  /**
   * Clear Conversation History
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Generate Query Suggestions
   */
  getSuggestions() {
    return [
      'Find students with the highest grade fluctuation',
      'Which assignments are the hardest?',
      'Show all students\' average scores',
      'Find assignments with latest submission times',
      'Compare average scores of Projects and Exams',
      'Show this semester\'s statistics',
      'Find students with scores below 60',
      'Submission activity in the last week',
      'Which student has the most assignments?',
      'View top 10 students by grade'
    ];
  }

  /**
   * Check if AI is configured
   */
  hasAIConfigured() {
    return !!this.apiKey;
  }

  /**
   * Check if initialized
   */
  isInitialized() {
    return this.initialized;
  }
}

// Export singleton
const aiAgent = new AIAgent();
export default aiAgent;
