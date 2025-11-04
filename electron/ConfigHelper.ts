// ConfigHelper.ts
import fs from "node:fs"
import path from "node:path"
import { app } from "electron"
import { EventEmitter } from "events"
import { OpenAI } from "openai"
import os from "node:os"

interface Config {
  apiKey: string;
  apiProvider: "openai" | "gemini" | "anthropic";  // Added provider selection
  extractionModel: string;
  solutionModel: string;
  debuggingModel: string;
  language: string;
  opacity: number;
}

export class ConfigHelper extends EventEmitter {
  private configPath: string;
  private defaultConfig: Config = {
    apiKey: "",
    apiProvider: "gemini", // Default to Gemini
    extractionModel: "gemini-2.5-flash", // Default to Flash for faster responses
    solutionModel: "gemini-2.5-flash",
    debuggingModel: "gemini-2.5-flash",
    language: "python",
    opacity: 1.0
  };

  constructor() {
    super();
    // Use the app's user data directory to store the config
    try {
      this.configPath = path.join(app.getPath('userData'), 'config.json');
      console.log('Config path:', this.configPath);
    } catch (err) {
      console.warn('Could not access user data path, using fallback');
      this.configPath = path.join(process.cwd(), 'config.json');
    }
    
    // Clear old config files and ensure the initial config file exists
    this.clearOldConfigFiles();
    this.ensureConfigExists();
  }

  /**
   * Ensure config file exists
   */
  private ensureConfigExists(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.saveConfig(this.defaultConfig);
      }
    } catch (err) {
      console.error("Error ensuring config exists:", err);
    }
  }

  /**
   * Validate and sanitize model selection to ensure only allowed models are used
   */
  private sanitizeModelSelection(model: string, provider: "openai" | "gemini" | "anthropic"): string {
    if (provider === "openai") {
      // Only allow gpt-5 family for OpenAI
      const allowedModels = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'];
      if (!allowedModels.includes(model)) {
        console.warn(`Invalid OpenAI model specified: ${model}. Using default model: gpt-5`);
        return 'gpt-5';
      }
      return model;
    } else if (provider === "gemini")  {
      // Only allow gemini-2.5-pro and gemini-2.5-flash for Gemini
      const allowedModels = ['gemini-2.5-pro', 'gemini-2.5-flash'];
      if (!allowedModels.includes(model)) {
        console.warn(`Invalid Gemini model specified: ${model}. Using default model: gemini-2.5-flash`);
        return 'gemini-2.5-flash';
      }
      return model;
    }  else if (provider === "anthropic") {
      // Only allow Claude models
      const allowedModels = ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'];
      if (!allowedModels.includes(model)) {
        console.warn(`Invalid Anthropic model specified: ${model}. Using default model: claude-3-7-sonnet-20250219`);
        return 'claude-3-7-sonnet-20250219';
      }
      return model;
    }
    // Default fallback
    return model;
  }

  public loadConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const config = JSON.parse(configData);
        
        // Ensure apiProvider is a valid value
        if (config.apiProvider !== "openai" && config.apiProvider !== "gemini"  && config.apiProvider !== "anthropic") {
          config.apiProvider = "gemini"; // Default to Gemini if invalid
        }
        
        // Sanitize model selections to ensure only allowed models are used
        if (config.extractionModel) {
          config.extractionModel = this.sanitizeModelSelection(config.extractionModel, config.apiProvider);
        }
        if (config.solutionModel) {
          config.solutionModel = this.sanitizeModelSelection(config.solutionModel, config.apiProvider);
        }
        if (config.debuggingModel) {
          config.debuggingModel = this.sanitizeModelSelection(config.debuggingModel, config.apiProvider);
        }
        
        return {
          ...this.defaultConfig,
          ...config
        };
      }
      
      // If no config exists, create a default one
      this.saveConfig(this.defaultConfig);
      return this.defaultConfig;
    } catch (err) {
      console.error("Error loading config:", err);
      return this.defaultConfig;
    }
  }

  /**
   * Save configuration to disk
   */
  public saveConfig(config: Config): void {
    try {
      // Ensure the directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      // Write the config file
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (err) {
      console.error("Error saving config:", err);
    }
  }

  /**
   * Update specific configuration values
   */
  public updateConfig(updates: Partial<Config>): Config {
    try {
      const currentConfig = this.loadConfig();
      let provider = updates.apiProvider || currentConfig.apiProvider;
      
      // Auto-detect provider based on API key format if a new key is provided
      if (updates.apiKey && !updates.apiProvider) {
        // If API key starts with "sk-", it's likely an OpenAI key
        if (updates.apiKey.trim().startsWith('sk-')) {
          provider = "openai";
          console.log("Auto-detected OpenAI API key format");
        } else if (updates.apiKey.trim().startsWith('sk-ant-')) {
          provider = "anthropic";
          console.log("Auto-detected Anthropic API key format");
        } else {
          provider = "gemini";
          console.log("Using Gemini API key format (default)");
        }
        
        // Update the provider in the updates object
        updates.apiProvider = provider;
      }
      
      // If provider is changing, reset models to the default for that provider
      if (updates.apiProvider && updates.apiProvider !== currentConfig.apiProvider) {
        if (updates.apiProvider === "openai") {
          updates.extractionModel = "gpt-5";
          updates.solutionModel = "gpt-5";
          updates.debuggingModel = "gpt-5";
        } else if (updates.apiProvider === "anthropic") {
          updates.extractionModel = "claude-3-7-sonnet-20250219";
          updates.solutionModel = "claude-3-7-sonnet-20250219";
          updates.debuggingModel = "claude-3-7-sonnet-20250219";
        } else {
          updates.extractionModel = "gemini-2.5-flash";
          updates.solutionModel = "gemini-2.5-flash";
          updates.debuggingModel = "gemini-2.5-flash";
        }
      }
      
      // Sanitize model selections in the updates
      if (updates.extractionModel) {
        updates.extractionModel = this.sanitizeModelSelection(updates.extractionModel, provider);
      }
      if (updates.solutionModel) {
        updates.solutionModel = this.sanitizeModelSelection(updates.solutionModel, provider);
      }
      if (updates.debuggingModel) {
        updates.debuggingModel = this.sanitizeModelSelection(updates.debuggingModel, provider);
      }
      
      const newConfig = { ...currentConfig, ...updates };
      this.saveConfig(newConfig);
      
      // Only emit update event for changes other than opacity
      // This prevents re-initializing the AI client when only opacity changes
      if (updates.apiKey !== undefined || updates.apiProvider !== undefined || 
          updates.extractionModel !== undefined || updates.solutionModel !== undefined || 
          updates.debuggingModel !== undefined || updates.language !== undefined) {
        this.emit('config-updated', newConfig);
      }
      
      return newConfig;
    } catch (error) {
      console.error('Error updating config:', error);
      return this.defaultConfig;
    }
  }

  /**
   * Check if the API key is configured
   */
  public hasApiKey(): boolean {
    const config = this.loadConfig();
    return !!config.apiKey && config.apiKey.trim().length > 0;
  }
  
  /**
   * Validate the API key format
   */
  public isValidApiKeyFormat(apiKey: string, provider?: "openai" | "gemini" | "anthropic" ): boolean {
    // If provider is not specified, attempt to auto-detect
    if (!provider) {
      if (apiKey.trim().startsWith('sk-')) {
        if (apiKey.trim().startsWith('sk-ant-')) {
          provider = "anthropic";
        } else {
          provider = "openai";
        }
      } else {
        provider = "gemini";
      }
    }
    
    if (provider === "openai") {
      // Basic format validation for OpenAI API keys
      return /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
    } else if (provider === "gemini") {
      // Basic format validation for Gemini API keys (usually alphanumeric with no specific prefix)
      return apiKey.trim().length >= 10; // Gemini keys are typically shorter than OpenAI keys
    } else if (provider === "anthropic") {
      // Basic format validation for Anthropic API keys
      return /^sk-ant-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
    }
    
    return false;
  }
  
  /**
   * Get the stored opacity value
   */
  public getOpacity(): number {
    const config = this.loadConfig();
    return config.opacity !== undefined ? config.opacity : 1.0;
  }

  /**
   * Set the window opacity value
   */
  public setOpacity(opacity: number): void {
    // Ensure opacity is between 0.1 and 1.0
    const validOpacity = Math.min(1.0, Math.max(0.1, opacity));
    this.updateConfig({ opacity: validOpacity });
  }  
  
  /**
   * Get the preferred programming language
   */
  public getLanguage(): string {
    const config = this.loadConfig();
    return config.language || "python";
  }

  /**
   * Set the preferred programming language
   */
  public setLanguage(language: string): void {
    this.updateConfig({ language });
  }
  
  /**
   * Test API key with the selected provider
   */
  public async testApiKey(apiKey: string, provider?: "openai" | "gemini" | "anthropic"): Promise<{valid: boolean, error?: string}> {
    // Auto-detect provider based on key format if not specified
    if (!provider) {
      if (apiKey.trim().startsWith('sk-')) {
        if (apiKey.trim().startsWith('sk-ant-')) {
          provider = "anthropic";
          console.log("Auto-detected Anthropic API key format for testing");
        } else {
          provider = "openai";
          console.log("Auto-detected OpenAI API key format for testing");
        }
      } else {
        provider = "gemini";
        console.log("Using Gemini API key format for testing (default)");
      }
    }
    
    if (provider === "openai") {
      return this.testOpenAIKey(apiKey);
    } else if (provider === "gemini") {
      return this.testGeminiKey(apiKey);
    } else if (provider === "anthropic") {
      return this.testAnthropicKey(apiKey);
    }
    
    return { valid: false, error: "Unknown API provider" };
  }
  
  /**
   * Test OpenAI API key
   */
  private async testOpenAIKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
    try {
      const openai = new OpenAI({ apiKey });
      // Make a simple API call to test the key
      await openai.models.list();
      return { valid: true };
    } catch (error: any) {
      console.error('OpenAI API key test failed:', error);
      
      // Determine the specific error type for better error messages
      let errorMessage = 'Unknown error validating OpenAI API key';
      
      if (error.status === 401) {
        errorMessage = 'Invalid API key. Please check your OpenAI key and try again.';
      } else if (error.status === 429) {
        errorMessage = 'Rate limit exceeded. Your OpenAI API key has reached its request limit or has insufficient quota.';
      } else if (error.status === 500) {
        errorMessage = 'OpenAI server error. Please try again later.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      return { valid: false, error: errorMessage };
    }
  }
  
  /**
   * Test Gemini API key
   * Note: This is a simplified implementation since we don't have the actual Gemini client
   */
  private async testGeminiKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
    try {
      // For now, we'll just do a basic check to ensure the key exists and has valid format
      // In production, you would connect to the Gemini API and validate the key
      if (apiKey && apiKey.trim().length >= 10) {
        // Here you would actually validate the key with a Gemini API call
        return { valid: true };
      }
      return { valid: false, error: 'Invalid Gemini API key format.' };
    } catch (error: any) {
      console.error('Gemini API key test failed:', error);
      let errorMessage = 'Unknown error validating Gemini API key';
      
      if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Test Anthropic API key
   * Note: This is a simplified implementation since we don't have the actual Anthropic client
   */
  private async testAnthropicKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
    try {
      // For now, we'll just do a basic check to ensure the key exists and has valid format
      // In production, you would connect to the Anthropic API and validate the key
      if (apiKey && /^sk-ant-[a-zA-Z0-9]{32,}$/.test(apiKey.trim())) {
        // Here you would actually validate the key with an Anthropic API call
        return { valid: true };
      }
      return { valid: false, error: 'Invalid Anthropic API key format.' };
    } catch (error: any) {
      console.error('Anthropic API key test failed:', error);
      let errorMessage = 'Unknown error validating Anthropic API key';
      
      if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Get the current code configuration (default config)
   */
  private getCurrentCodeConfig(): Config {
    return { ...this.defaultConfig };
  }

  /**
   * Check if stored config matches current code config
   */
  private isConfigValid(storedConfig: Config): boolean {
    const currentConfig = this.getCurrentCodeConfig();
    
    // Check if the stored config has the same structure as current config
    const requiredKeys = Object.keys(currentConfig) as (keyof Config)[];
    const storedKeys = Object.keys(storedConfig) as (keyof Config)[];
    
    // Check if all required keys exist in stored config
    for (const key of requiredKeys) {
      if (!(key in storedConfig)) {
        console.log(`Missing required config key: ${key}`);
        return false;
      }
    }
    
    // Check for any extra keys that shouldn't be there
    for (const key of storedKeys) {
      if (!(key in currentConfig)) {
        console.log(`Extra config key found: ${key}`);
        return false;
      }
    }
    
    // Check if apiProvider is valid
    if (!['openai', 'gemini', 'anthropic'].includes(storedConfig.apiProvider)) {
      console.log(`Invalid apiProvider: ${storedConfig.apiProvider}`);
      return false;
    }
    
    // Check if models are valid for the selected provider
    const provider = storedConfig.apiProvider;
    const validModels = this.getValidModelsForProvider(provider);
    
    if (!validModels.includes(storedConfig.extractionModel)) {
      console.log(`Invalid extractionModel: ${storedConfig.extractionModel} for provider: ${provider}`);
      return false;
    }
    
    if (!validModels.includes(storedConfig.solutionModel)) {
      console.log(`Invalid solutionModel: ${storedConfig.solutionModel} for provider: ${provider}`);
      return false;
    }
    
    if (!validModels.includes(storedConfig.debuggingModel)) {
      console.log(`Invalid debuggingModel: ${storedConfig.debuggingModel} for provider: ${provider}`);
      return false;
    }
    
    return true;
  }

  /**
   * Get valid models for a specific provider
   */
  private getValidModelsForProvider(provider: "openai" | "gemini" | "anthropic"): string[] {
    if (provider === "openai") {
      return ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'];
    } else if (provider === "gemini") {
      return ['gemini-2.5-pro', 'gemini-2.5-flash'];
    } else if (provider === "anthropic") {
      return ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'];
    }
    return [];
  }

  /**
   * Get all possible config file paths across different OS and locations
   */
  private getPossibleConfigPaths(): string[] {
    const paths: string[] = [];
    const platform = os.platform();
    
    try {
      // Current app's userData path
      paths.push(path.join(app.getPath('userData'), 'config.json'));
    } catch (err) {
      console.warn('Could not get app userData path');
    }
    
    // Add platform-specific paths
    if (platform === 'win32') {
      // Windows paths
      const userProfile = process.env.USERPROFILE || process.env.HOMEPATH;
      if (userProfile) {
        paths.push(path.join(userProfile, 'AppData', 'Roaming', 'Electron', 'config.json'));
        paths.push(path.join(userProfile, 'AppData', 'Roaming', 'interview-coder-v1', 'config.json'));
      }
    } else if (platform === 'darwin') {
      // macOS paths
      const homeDir = os.homedir();
      paths.push(path.join(homeDir, 'Library', 'Application Support', 'Electron', 'config.json'));
      paths.push(path.join(homeDir, 'Library', 'Application Support', 'interview-coder-v1', 'config.json'));
    } else {
      // Linux paths
      const homeDir = os.homedir();
      paths.push(path.join(homeDir, '.config', 'Electron', 'config.json'));
      paths.push(path.join(homeDir, '.config', 'interview-coder-v1', 'config.json'));
      paths.push(path.join(homeDir, '.config', 'interview-coder', 'config.json'));
    }
    
    // Add current working directory path
    paths.push(path.join(process.cwd(), 'config.json'));
    
    return paths;
  }

  /**
   * Clear old config files that don't match current code configuration
   */
  private clearOldConfigFiles(): void {
    console.log('Checking for old config files...');
    
    const possiblePaths = this.getPossibleConfigPaths();
    let clearedCount = 0;
    
    for (const configPath of possiblePaths) {
      try {
        if (fs.existsSync(configPath)) {
          console.log(`Found config file at: ${configPath}`);
          
          // Read and validate the config
          const configData = fs.readFileSync(configPath, 'utf8');
          const storedConfig = JSON.parse(configData);
          
          // Check if this config is valid
          if (!this.isConfigValid(storedConfig)) {
            console.log(`Invalid config found at: ${configPath}. Clearing...`);
            fs.unlinkSync(configPath);
            clearedCount++;
            console.log(`Cleared invalid config file: ${configPath}`);
          } else {
            console.log(`Valid config found at: ${configPath}. Keeping...`);
          }
        }
      } catch (error) {
        console.warn(`Error processing config file at ${configPath}:`, error);
        // If we can't read the file, it might be corrupted, so we'll try to remove it
        try {
          if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
            clearedCount++;
            console.log(`Cleared corrupted config file: ${configPath}`);
          }
        } catch (unlinkError) {
          console.warn(`Could not remove corrupted config file at ${configPath}:`, unlinkError);
        }
      }
    }
    
    if (clearedCount > 0) {
      console.log(`Cleared ${clearedCount} old/invalid config files`);
    } else {
      console.log('No old config files found to clear');
    }
  }

  /**
   * Force clear all config files (for debugging or manual reset)
   */
  public clearAllConfigFiles(): void {
    console.log('Force clearing all config files...');
    
    const possiblePaths = this.getPossibleConfigPaths();
    let clearedCount = 0;
    
    for (const configPath of possiblePaths) {
      try {
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
          clearedCount++;
          console.log(`Cleared config file: ${configPath}`);
        }
      } catch (error) {
        console.warn(`Error clearing config file at ${configPath}:`, error);
      }
    }
    
    console.log(`Force cleared ${clearedCount} config files`);
  }
}

// Export a singleton instance
export const configHelper = new ConfigHelper();
