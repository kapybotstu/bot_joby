import { FirebaseApp, initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  getDocs,
  DocumentData,
  QueryConstraint,
  Firestore
} from 'firebase/firestore';

/**
 * Firebase Tools - A module for handling Firebase operations for the WhatsApp bot
 * 
 * This module provides an abstraction layer over Firebase operations,
 * allowing the bot to interact with the database without exposing Firebase details to users.
 */

// Types for processing messages and commands
export interface MessageContent {
  userMessage: string;
  commands: string[];
}

export interface CommandResult {
  command: string;
  result?: any;
  error?: string;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export interface UserSession {
  userId: string;
  conversations: Array<{
    timestamp: string;
    userMessage: string;
    botResponse: string;
  }>;
  createdAt: string;
  lastActivity: string;
  preferences?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Firebase service class that handles all interactions with Firebase
 */
export class FirebaseService {
  private firebaseApp: FirebaseApp;
  private db: Firestore;
  private isConnected: boolean = false;
  private userSessions: Map<string, UserSession> = new Map();
  private useLocalStorage: boolean = false;

  /**
   * Initialize Firebase with the provided configuration
   */
  constructor(config: FirebaseConfig, useLocalStorage: boolean = false) {
    try {
      this.firebaseApp = initializeApp(config);
      this.db = getFirestore(this.firebaseApp);
      this.isConnected = true;
      this.useLocalStorage = useLocalStorage;
      console.log("✅ Firebase initialized successfully");
    } catch (error) {
      console.error("❌ Error initializing Firebase:", error);
      this.isConnected = false;
    }
  }

  /**
   * Check if Firebase is connected and available
   */
  isFirebaseConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Process natural language commands into Firebase operations
   * @param commands Array of commands to execute
   * @returns Results of command execution
   */
  async executeCommands(commands: string[]): Promise<CommandResult[]> {
    if (!this.isConnected) {
      console.warn("⚠️ Firebase not connected. Cannot execute commands.");
      return [{
        command: "firebase:connection",
        error: "Firebase not connected"
      }];
    }
    
    const results: CommandResult[] = [];
    
    for (const command of commands) {
      try {
        if (!command.startsWith('firebase:')) continue;
        
        const parts = command.split(':');
        const operation = parts[1]; // get, update, set, query
        const path = parts[2]; // collection/docId
        
        const pathParts = path.split('/');
        const collectionName = pathParts[0];
        
        // Handle document ID with placeholders
        let documentId = pathParts[1];
        if (documentId && documentId.includes('{') && documentId.includes('}')) {
          // Extract the real ID from placeholder format like {userId}
          const placeholder = documentId.match(/\{([^}]+)\}/)?.[1] || '';
          documentId = placeholder;
        }
        
        switch (operation) {
          case 'get': {
            if (documentId) {
              // Get a specific document
              const docRef = doc(this.db, collectionName, documentId);
              const docSnap = await getDoc(docRef);
              
              results.push({
                command,
                result: docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null
              });
            } else {
              // Get all documents in a collection
              const querySnapshot = await getDocs(collection(this.db, collectionName));
              const documents: DocumentData[] = [];
              
              querySnapshot.forEach(doc => {
                documents.push({ id: doc.id, ...doc.data() });
              });
              
              results.push({
                command,
                result: documents
              });
            }
            break;
          }
          
          case 'set': {
            const data = this.parseCommandParams(parts[3]);
            await setDoc(doc(this.db, collectionName, documentId), {
              ...data,
              updatedAt: new Date().toISOString()
            });
            
            results.push({
              command,
              result: { success: true, message: `Document ${documentId} set in ${collectionName}` }
            });
            break;
          }
          
          case 'update': {
            const updateData = this.parseCommandParams(parts[3]);
            await updateDoc(doc(this.db, collectionName, documentId), {
              ...updateData,
              updatedAt: new Date().toISOString()
            });
            
            results.push({
              command,
              result: { success: true, message: `Document ${documentId} updated in ${collectionName}` }
            });
            break;
          }
          
          case 'query': {
            const queryConditions = this.parseQueryParams(parts[3]);
            
            // Build query with conditions
            const constraints: QueryConstraint[] = queryConditions.map(condition => 
              where(condition.field, condition.operator as any, condition.value)
            );
            
            const q = query(collection(this.db, collectionName), ...constraints);
            const querySnapshot = await getDocs(q);
            
            const queryResults: DocumentData[] = [];
            querySnapshot.forEach(doc => {
              queryResults.push({ id: doc.id, ...doc.data() });
            });
            
            results.push({
              command,
              result: queryResults
            });
            break;
          }

          case 'count': {
            // Count documents in a collection (optionally with query conditions)
            const queryConditions = parts[3] ? this.parseQueryParams(parts[3]) : [];
            
            let q;
            if (queryConditions.length > 0) {
              const constraints: QueryConstraint[] = queryConditions.map(condition => 
                where(condition.field, condition.operator as any, condition.value)
              );
              q = query(collection(this.db, collectionName), ...constraints);
            } else {
              q = collection(this.db, collectionName);
            }
            
            const querySnapshot = await getDocs(q);
            
            results.push({
              command,
              result: { count: querySnapshot.size }
            });
            break;
          }
          
          default: {
            results.push({
              command,
              error: `Unknown operation: ${operation}`
            });
            break;
          }
        }
      } catch (error: any) {
        console.error(`Error executing command ${command}:`, error);
        results.push({
          command,
          error: error.message || 'Unknown error'
        });
      }
    }
    
    return results;
  }

  /**
   * Load a user session from Firebase or create a new one
   */
  async loadUserSession(userId: string): Promise<UserSession> {
    try {
      if (!this.isConnected) {
        throw new Error("Firebase not connected");
      }

      // Check if session is already in memory
      const cachedSession = this.userSessions.get(userId);
      if (cachedSession) {
        return cachedSession;
      }

      // Try to load from Firestore
      const userDocRef = doc(this.db, 'userSessions', userId);
      const userDocSnap = await getDoc(userDocRef);
      
      let session: UserSession;
      
      if (userDocSnap.exists()) {
        session = userDocSnap.data() as UserSession;
      } else {
        // Create new session
        session = {
          userId,
          conversations: [],
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString()
        };
        
        await setDoc(userDocRef, session);
      }
      
      // Cache in memory
      this.userSessions.set(userId, session);
      return session;
      
    } catch (error) {
      console.error('Error loading user session:', error);
      
      // Fall back to local storage if enabled
      if (this.useLocalStorage) {
        return this.loadUserSessionFromLocalStorage(userId);
      }
      
      // Create a new in-memory session as last resort
      const newSession: UserSession = {
        userId,
        conversations: [],
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
      
      this.userSessions.set(userId, newSession);
      return newSession;
    }
  }

  /**
   * Update a user session with a new conversation entry
   */
  async updateUserSession(userId: string, userMessage: string, botResponse: string): Promise<void> {
    try {
      // Get current session (or load if not in memory)
      let session = this.userSessions.get(userId);
      if (!session) {
        session = await this.loadUserSession(userId);
      }
      
      // Add new conversation entry
      const newEntry = {
        timestamp: new Date().toISOString(),
        userMessage,
        botResponse
      };
      
      session.conversations.push(newEntry);
      session.lastActivity = new Date().toISOString();
      
      // Update in memory
      this.userSessions.set(userId, session);
      
      // Update in Firebase if connected
      if (this.isConnected) {
        const userDocRef = doc(this.db, 'userSessions', userId);
        await updateDoc(userDocRef, {
          conversations: session.conversations,
          lastActivity: session.lastActivity
        });
      } else if (this.useLocalStorage) {
        // Fall back to local storage
        this.updateUserSessionInLocalStorage(userId, session);
      }
    } catch (error) {
      console.error('Error updating user session:', error);
      
      // Try local storage as fallback
      if (this.useLocalStorage) {
        const session = this.userSessions.get(userId);
        if (session) {
          this.updateUserSessionInLocalStorage(userId, session);
        }
      }
    }
  }

  /**
   * Format Firebase query results into a human-readable message
   * 
   * @param commandResults Results from Firebase commands
   * @param queryContext Context of the original query
   * @returns Formatted message for the user
   */
  formatResultsForUser(commandResults: CommandResult[], queryContext: string = ""): string {
    // No results case
    if (!commandResults || commandResults.length === 0) {
      return "No se encontraron resultados para tu consulta.";
    }
    
    // Error case
    const errors = commandResults.filter(result => result.error);
    if (errors.length > 0) {
      return "Ocurrió un problema al procesar tu consulta. Por favor, intenta de nuevo más tarde.";
    }
    
    // Process results based on command type
    let formattedMessage = "";
    
    for (const result of commandResults) {
      if (!result.result) continue;
      
      // Detect command type from the command string
      const commandParts = result.command.split(':');
      const operation = commandParts[1]; // get, query, etc.
      const collection = commandParts[2]?.split('/')[0]; // collection name
      
      switch (operation) {
        case 'get': {
          // Single document or collection of documents
          if (Array.isArray(result.result)) {
            // Collection of documents
            formattedMessage += this.formatCollectionResults(result.result, collection, queryContext);
          } else {
            // Single document
            formattedMessage += this.formatDocumentResult(result.result, collection, queryContext);
          }
          break;
        }
          
        case 'query': {
          // Always a collection of filtered documents
          formattedMessage += this.formatCollectionResults(result.result, collection, queryContext);
          break;
        }
          
        case 'set':
        case 'update': {
          // Success messages
          formattedMessage += "La información ha sido actualizada exitosamente.";
          break;
        }
          
        case 'count': {
          formattedMessage += `Se encontraron ${result.result.count} resultados.`;
          break;
        }
      }
    }
    
    return formattedMessage || "Tu consulta fue procesada, pero no hay información adicional para mostrar.";
  }

  /**
   * Generate analytical insights from data for the user
   * 
   * @param data The data to analyze
   * @param context Context about what's being analyzed
   * @returns Insights about the data
   */
  generateInsights(data: any[], context: string = ""): string {
    if (!data || data.length === 0) {
      return "No hay datos suficientes para generar un análisis.";
    }

    let insights = "";
    
    // Detect if we're dealing with employee benefits data
    if (data[0].Beneficio_seleccionado || data[0].Categoria) {
      // Benefits data analysis
      const totalRecords = data.length;
      
      // Count by category
      const categoryCounts: Record<string, number> = {};
      data.forEach(item => {
        const category = item.Categoria || 'Sin categoría';
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      });
      
      // Sort categories by frequency
      const sortedCategories = Object.entries(categoryCounts)
        .sort(([, countA], [, countB]) => countB - countA);
      
      // Count by generation
      const generationCounts: Record<string, number> = {};
      data.forEach(item => {
        const generation = item.Generacion || 'No especificada';
        generationCounts[generation] = (generationCounts[generation] || 0) + 1;
      });
      
      // Count by gender
      const genderCount = {
        H: data.filter(item => item.H_M === 'H').length,
        M: data.filter(item => item.H_M === 'M').length
      };
      
      // Generate insights text
      insights = `Análisis de datos (${totalRecords} registros):\n\n`;
      
      // Category insights
      insights += "Categorías más populares:\n";
      sortedCategories.slice(0, 3).forEach(([category, count]) => {
        const percentage = Math.round((count / totalRecords) * 100);
        insights += `- ${category}: ${count} (${percentage}%)\n`;
      });
      
      // Generation insights
      insights += "\nDistribución por generación:\n";
      Object.entries(generationCounts).forEach(([generation, count]) => {
        const percentage = Math.round((count / totalRecords) * 100);
        insights += `- ${generation}: ${count} (${percentage}%)\n`;
      });
      
      // Gender insights
      const malePercentage = Math.round((genderCount.H / totalRecords) * 100);
      const femalePercentage = Math.round((genderCount.M / totalRecords) * 100);
      insights += `\nDistribución por género: ${genderCount.H} hombres (${malePercentage}%) y ${genderCount.M} mujeres (${femalePercentage}%)\n`;
    } else {
      // Generic data analysis
      insights = `Se encontraron ${data.length} registros. Para obtener un análisis más detallado, por favor especifica qué información deseas conocer.`;
    }
    
    return insights;
  }

  // Private helper methods

  /**
   * Parse command parameters from string format (name=value,age=25)
   */
  private parseCommandParams(paramsString: string): Record<string, any> {
    if (!paramsString) return {};
    
    const result: Record<string, any> = {};
    const params = paramsString.split(',');
    
    for (const param of params) {
      const [key, value] = param.split('=');
      if (key && value !== undefined) {
        // Try to convert value to appropriate type
        if (value === 'true') {
          result[key] = true;
        } else if (value === 'false') {
          result[key] = false;
        } else if (!isNaN(Number(value))) {
          result[key] = Number(value);
        } else {
          result[key] = value;
        }
      }
    }
    
    return result;
  }

  /**
   * Parse query parameters with operators (category=electronics,price<1000)
   */
  private parseQueryParams(paramsString: string): Array<{field: string, operator: string, value: any}> {
    if (!paramsString) return [];
    
    const result: Array<{field: string, operator: string, value: any}> = [];
    const params = paramsString.split(',');
    
    for (const param of params) {
      // Check for operators: =, <, >, <=, >=, !=
      const operatorMatch = param.match(/([^<>=!]+)([<>=!]{1,2})(.+)/);
      
      if (operatorMatch) {
        const [, field, operator, valueStr] = operatorMatch;
        
        // Convert symbols to Firestore operators
        let firestoreOperator;
        switch (operator) {
          case '=': {
            firestoreOperator = '=='; 
            break;
          }
          case '<': {
            firestoreOperator = '<'; 
            break;
          }
          case '>': {
            firestoreOperator = '>'; 
            break;
          }
          case '<=': {
            firestoreOperator = '<='; 
            break;
          }
          case '>=': {
            firestoreOperator = '>='; 
            break;
          }
          case '!=': {
            firestoreOperator = '!='; 
            break;
          }
          default: {
            firestoreOperator = '==';
            break;
          }
        }
        
        // Convert value to appropriate type
        let value = valueStr;
        if (valueStr === 'true') {
          value = true;
        } else if (valueStr === 'false') {
          value = false;
        } else if (!isNaN(Number(valueStr))) {
          value = Number(valueStr);
        }
        
        result.push({
          field: field.trim(),
          operator: firestoreOperator,
          value
        });
      } else {
        // Default to equality check if no operator found
        const [field, valueStr] = param.split('=');
        if (field && valueStr) {
          // Convert value to appropriate type
          let value = valueStr;
          if (valueStr === 'true') {
            value = true;
          } else if (valueStr === 'false') {
            value = false;
          } else if (!isNaN(Number(valueStr))) {
            value = Number(valueStr);
          }
          
          result.push({
            field: field.trim(),
            operator: '==',
            value
          });
        }
      }
    }
    
    return result;
  }

  /**
   * Load user session from localStorage when Firebase is unavailable
   */
  private loadUserSessionFromLocalStorage(userId: string): UserSession {
    try {
      if (typeof localStorage !== 'undefined') {
        const sessionData = localStorage.getItem(`userSession_${userId}`);
        if (sessionData) {
          const session = JSON.parse(sessionData) as UserSession;
          this.userSessions.set(userId, session);
          return session;
        }
      }
      
      // No session found, create new one
      const newSession: UserSession = {
        userId,
        conversations: [],
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
      
      this.userSessions.set(userId, newSession);
      
      // Save to localStorage if available
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`userSession_${userId}`, JSON.stringify(newSession));
      }
      
      return newSession;
    } catch (error) {
      console.error('Error accessing local storage:', error);
      
      // Fallback to in-memory session
      const newSession: UserSession = {
        userId,
        conversations: [],
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
      
      this.userSessions.set(userId, newSession);
      return newSession;
    }
  }

  /**
   * Update user session in localStorage
   */
  private updateUserSessionInLocalStorage(userId: string, session: UserSession): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`userSession_${userId}`, JSON.stringify(session));
      }
    } catch (error) {
      console.error('Error updating local storage:', error);
    }
  }

  /**
   * Format a collection of documents into a readable message
   */
  private formatCollectionResults(documents: any[], collectionName: string, context: string): string {
    if (!documents || documents.length === 0) {
      return "No se encontraron resultados.";
    }
    
    // Determine the type of data and format accordingly
    if (collectionName === 'userSessions') {
      return `Se encontraron ${documents.length} sesiones de usuario.`;
    }
    
    // For benefit data (as seen in the provided sample)
    if (documents[0].Beneficio_seleccionado || documents[0].Categoria) {
      // Format specifically for benefit data
      return this.formatBenefitData(documents, context);
    }
    
    // Generic formatting for other data types
    let message = `Se encontraron ${documents.length} resultados:\n\n`;
    
    // Limit the number of items to display to avoid extremely long messages
    const displayLimit = Math.min(5, documents.length);
    
    for (let i = 0; i < displayLimit; i++) {
      const doc = documents[i];
      const id = doc.id || doc.Id_usuario || 'Sin ID';
      
      message += `${i + 1}. ID: ${id}\n`;
      
      // Display a subset of fields for readability
      const keyFields = Object.keys(doc).slice(0, 5);
      keyFields.forEach(field => {
        if (field !== 'id' && field !== 'Id_usuario') {
          message += `   ${field}: ${doc[field]}\n`;
        }
      });
      
      if (Object.keys(doc).length > 5) {
        message += `   ...\n`;
      }
      
      message += '\n';
    }
    
    if (documents.length > displayLimit) {
      message += `... y ${documents.length - displayLimit} resultados más.`;
    }
    
    return message;
  }

  /**
   * Format benefit data (specific to the provided sample data)
   */
  private formatBenefitData(benefits: any[], context: string): string {
    // Detect the focus of the query from context
    const isFocusedOnPerson = context.toLowerCase().includes('persona') || 
                             context.toLowerCase().includes('empleado') ||
                             context.toLowerCase().includes('usuario');
                             
    const isFocusedOnBenefit = context.toLowerCase().includes('beneficio') ||
                              context.toLowerCase().includes('categoria');
                              
    const isFocusedOnMonth = context.toLowerCase().includes('mes') ||
                            context.toLowerCase().includes('fecha');
    
    if (isFocusedOnPerson) {
      // Group by person
      const personBenefits: Record<string, any[]> = {};
      
      benefits.forEach(benefit => {
        const personName = benefit.Nombre || 'Sin nombre';
        if (!personBenefits[personName]) {
          personBenefits[personName] = [];
        }
        personBenefits[personName].push(benefit);
      });
      
      // Format message
      let message = "";
      
      for (const [person, personData] of Object.entries(personBenefits)) {
        message += `${person}:\n`;
        
        personData.forEach(benefit => {
          const benefitName = benefit.Beneficio_seleccionado || 'No seleccionado';
          const month = benefit.Mes_de_beneficio || 'Sin mes';
          const status = benefit.Estado || 'Pendiente';
          
          message += `- ${month}: ${benefitName} (${status})\n`;
        });
        
        message += '\n';
      }
      
      return message;
    }
    
    if (isFocusedOnBenefit) {
      // Group by benefit category
      const categories: Record<string, number> = {};
      const benefitTypes: Record<string, number> = {};
      
      benefits.forEach(benefit => {
        const category = benefit.Categoria || 'Sin categoría';
        categories[category] = (categories[category] || 0) + 1;
        
        const benefitName = benefit.Beneficio_seleccionado || 'No seleccionado';
        benefitTypes[benefitName] = (benefitTypes[benefitName] || 0) + 1;
      });
      
      // Format message
      let message = "Resumen de beneficios:\n\n";
      
      message += "Por categoría:\n";
      for (const [category, count] of Object.entries(categories)) {
        message += `- ${category}: ${count}\n`;
      }
      
      message += "\nBeneficios más populares:\n";
      const topBenefits = Object.entries(benefitTypes)
        .sort(([, countA], [, countB]) => countB - countA)
        .slice(0, 5);
        
      topBenefits.forEach(([benefit, count]) => {
        message += `- ${benefit}: ${count}\n`;
      });
      
      return message;
    }
    
    if (isFocusedOnMonth) {
      // Group by month
      const monthData: Record<string, any> = {};
      
      benefits.forEach(benefit => {
        const month = benefit.Mes_de_beneficio || 'Sin mes';
        if (!monthData[month]) {
          monthData[month] = {
            total: 0,
            categories: {},
            statuses: {}
          };
        }
        
        monthData[month].total++;
        
        const category = benefit.Categoria || 'Sin categoría';
        monthData[month].categories[category] = (monthData[month].categories[category] || 0) + 1;
        
        const status = benefit.Estado || 'Pendiente';
        monthData[month].statuses[status] = (monthData[month].statuses[status] || 0) + 1;
      });
      
      // Format message
      let message = "Resumen por mes:\n\n";
      
      for (const [month, data] of Object.entries(monthData)) {
        message += `${month}: ${data.total} beneficios\n`;
        
        message += "  Categorías:\n";
        for (const [category, count] of Object.entries(data.categories)) {
          message += `  - ${category}: ${count}\n`;
        }
        
        message += "  Estados:\n";
        for (const [status, count] of Object.entries(data.statuses)) {
          message += `  - ${status}: ${count}\n`;
        }
        
        message += '\n';
      }
      
      return message;
    }
    
    // Default formatting
    let message = `Se encontraron ${benefits.length} beneficios.\n\n`;
    
    // Limit display for readability
    const displayLimit = Math.min(5, benefits.length);
    
    for (let i = 0; i < displayLimit; i++) {
      const benefit = benefits[i];
      const name = benefit.Nombre || 'Sin nombre';
      const benefitName = benefit.Beneficio_seleccionado || 'No seleccionado';
      const month = benefit.Mes_de_beneficio || 'Sin mes';
      const status = benefit.Estado || 'Pendiente';
      
      message += `${i + 1}. ${name} - ${benefitName} (${month}, ${status})\n`;
    }
    
    if (benefits.length > displayLimit) {
      message += `... y ${benefits.length - displayLimit} beneficios más.`;
    }
    
    return message;
  }

  /**
   * Format a single document result into a readable message
   */
  private formatDocumentResult(document: any, collectionName: string, context: string): string {
    if (!document) {
      return "No se encontró el documento solicitado.";
    }
    
    if (collectionName === 'userSessions') {
      // Format user session data
      const username = document.userId || 'Usuario';
      const conversationCount = document.conversations?.length || 0;
      const lastActivity = document.lastActivity || 'Desconocida';
      
      return `Información de sesión para ${username}: ${conversationCount} interacciones, última actividad: ${lastActivity}`;
    }
    
    // For benefit data
    if (document.Beneficio_seleccionado || document.Categoria) {
      const name = document.Nombre || 'Sin nombre';
      const benefitName = document.Beneficio_seleccionado || 'No seleccionado';
      const category = document.Categoria || 'Sin categoría';
      const month = document.Mes_de_beneficio || 'Sin mes';
      const status = document.Estado || 'Pendiente';
      const comments = document.Comentarios || 'Sin comentarios';
      
      let message = `Información para ${name}:\n\n`;
      message += `Beneficio: ${benefitName}\n`;
      message += `Categoría: ${category}\n`;
      message += `Mes: ${month}\n`;
      message += `Estado: ${status}\n`;
      
      if (comments !== 'Sin comentarios') {
        message += `Comentarios: ${comments}\n`;
      }
      
      return message;
    }
    
    // Generic document formatting
    let message = `Información del documento:\n\n`;
    
    for (const [key, value] of Object.entries(document)) {
      // Skip internal fields or complex objects
      if (key === 'id' || typeof value === 'object') continue;
      
      message += `${key}: ${value}\n`;
    }
    
    return message;
  }
}

/**
 * Factory function to create a Firebase service instance
 */
export function createFirebaseService(config: FirebaseConfig, useLocalStorage: boolean = false): FirebaseService {
  return new FirebaseService(config, useLocalStorage);
}

/**
 * Helper function to generate Firebase commands from natural language
 * This function would typically be used with a language model like GPT
 */
export function generateFirebaseCommands(intent: string, parameters: Record<string, any> = {}): string[] {
  const commands: string[] = [];
  
  // Map common intents to Firebase commands
  switch (intent.toLowerCase()) {
    case 'get_user_benefits':
    case 'consultar_beneficios_usuario': {
      if (parameters.userId) {
        commands.push(`firebase:query:userBenefits:Id_usuario=${parameters.userId}`);
      } else if (parameters.userName) {
        commands.push(`firebase:query:userBenefits:Nombre=${parameters.userName}`);
      }
      break;
    }
      
    case 'get_benefits_by_category':
    case 'consultar_beneficios_categoria': {
      if (parameters.category) {
        commands.push(`firebase:query:userBenefits:Categoria=${parameters.category}`);
      }
      break;
    }
      
    case 'get_benefits_by_month':
    case 'consultar_beneficios_mes': {
      if (parameters.month) {
        commands.push(`firebase:query:userBenefits:Mes_de_beneficio=${parameters.month}`);
      }
      break;
    }
      
    case 'get_user_session':
    case 'consultar_sesion_usuario': {
      if (parameters.userId) {
        commands.push(`firebase:get:userSessions/${parameters.userId}`);
      }
      break;
    }
      
    case 'update_user_preference':
    case 'actualizar_preferencia_usuario': {
      if (parameters.userId && parameters.preferences) {
        // Convert preferences object to command parameters
        const prefsParams = Object.entries(parameters.preferences)
          .map(([key, value]) => `${key}=${value}`)
          .join(',');
          
        commands.push(`firebase:update:userPreferences/${parameters.userId}:${prefsParams}`);
      }
      break;
    }
      
    case 'count_benefits':
    case 'contar_beneficios': {
      // Optionally add conditions
      let countParams = '';
      if (parameters.category) {
        countParams = `Categoria=${parameters.category}`;
      } else if (parameters.month) {
        countParams = `Mes_de_beneficio=${parameters.month}`;
      }
      
      commands.push(`firebase:count:userBenefits${countParams ? ':' + countParams : ''}`);
      break;
    }
      
    default: {
      // For unknown intents, no commands are generated
      break;
    }
  }
  
  return commands;
}

export default {
  createFirebaseService,
  generateFirebaseCommands
};