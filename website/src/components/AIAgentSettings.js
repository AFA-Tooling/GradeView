// src/components/AIAgentSettings.js
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  IconButton,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Close,
  VpnKey,
  CheckCircle,
  Info,
} from '@mui/icons-material';
import aiAgent from '../services/aiAgent';

/**
 * AI Agent Settings Dialog
 * Configure AI API key and view current status
 */
export default function AIAgentSettings({ open, onClose }) {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  
  // Check if API key exists in environment variables
  const hasEnvApiKey = !!process.env.REACT_APP_OPENAI_API_KEY;

  const handleSave = () => {
    if (apiKey.trim()) {
      aiAgent.initialize(apiKey);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 1500);
    }
  };

  const handleClear = () => {
    setApiKey('');
    aiAgent.initialize('');
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <VpnKey sx={{ mr: 1, color: '#4f46e5' }} />
            <Typography variant="h6">AI Agent Settings</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            AI Agent is connected to the real database and queries will return actual student grade data.
            {hasEnvApiKey ? (
              <><br/><strong>API key detected in environment variables</strong>, AI-enhanced analytics features are enabled.</>
            ) : (
              <><br/>Configure OpenAI API key to enable AI-enhanced analytics features.</>
            )}
          </Typography>
        </Alert>

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            Current Status
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip 
              icon={<CheckCircle />}
              label="Database Connected"
              color="success"
              size="small"
            />
            {(hasEnvApiKey || aiAgent.apiKey) && (
              <Chip 
                icon={<CheckCircle />}
                label="AI Enhanced Enabled"
                color="success"
                size="small"
              />
            )}
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            OpenAI API Key Configuration (Optional)
          </Typography>
          {hasEnvApiKey ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              API key loaded from environment variable REACT_APP_OPENAI_API_KEY
            </Alert>
          ) : null}
          <TextField
            fullWidth
            size="small"
            type={showKey ? 'text' : 'password'}
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            helperText="For AI-enhanced analytics. Can also be configured via environment variable REACT_APP_OPENAI_API_KEY"
            sx={{ mb: 2 }}
          />
          <Button
            size="small"
            onClick={() => setShowKey(!showKey)}
            sx={{ textTransform: 'none' }}
          >
            {showKey ? 'Hide' : 'Show'} Key
          </Button>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            <Info sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
            How It Works
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            AI Agent understands the database structure and automatically generates SQL queries from your natural language - no code required!
          </Alert>
          <List dense>
            <ListItem>
              <ListItemText 
                primary="1. Database Schema Understanding"
                secondary="Agent knows the table structure: students, assignments, submissions, courses"
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="2. Dynamic SQL Generation"
                secondary="Based on your question, AI automatically generates appropriate SQL query statements"
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="3. Safe Execution"
                secondary="Automatically validates SQL security, only allows SELECT queries, prevents data modification"
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="4. Intelligent Explanation"
                secondary="AI explains query results in plain language and provides follow-up analysis suggestions"
              />
            </ListItem>
          </List>
        </Box>
        
        <Divider sx={{ my: 2 }} />
        
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            Database Structure Preview
          </Typography>
          <Box sx={{ 
            bgcolor: '#f8f9fa', 
            p: 2, 
            borderRadius: 1,
            fontSize: '0.85rem',
            fontFamily: 'monospace'
          }}>
            <Typography variant="caption" component="div">
              <strong>students:</strong> id, sid, email, legal_name
            </Typography>
            <Typography variant="caption" component="div">
              <strong>assignments:</strong> id, title, category, max_points
            </Typography>
            <Typography variant="caption" component="div">
              <strong>submissions:</strong> id, student_id, assignment_id, total_score, submission_time
            </Typography>
            <Typography variant="caption" component="div">
              <strong>courses:</strong> id, name, semester, year
            </Typography>
          </Box>
        </Box>

        {saved && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Settings saved!
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClear} sx={{ textTransform: 'none' }}>
          Clear Configuration
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained"
          disabled={!apiKey.trim()}
          sx={{ 
            textTransform: 'none',
            bgcolor: '#4f46e5',
            '&:hover': { bgcolor: '#4338ca' }
          }}
        >
          Save Settings
        </Button>
      </DialogActions>
    </Dialog>
  );
}
