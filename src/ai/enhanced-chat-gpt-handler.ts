import axios from 'axios';
import EnhancedFirebaseService from './enhanced-firebase-service';
import logger, { LogLevel } from './firebase-logger';

// Constants for logging categories
const LOG_CATEGORY = {
  GPT: 'ChatGPT',
  COMMANDS: 'Commands',
  PERFORMANCE: 'Performance',
  MESSAGE: 'Message'
};

interface ChatGPTConfig {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
}

interface MessageContent {
  userMessage: string;
  commands: string[];
}

/**
 * Enhanced ChatGPT Handler with comprehensive logging
 * 
 * This class handles the interaction between user messages, ChatGPT, and Firebase,
 * with improved performance tracking and logging.
 */
class EnhancedChatGPTHandler {
  private config: ChatGPTConfig;
  private firebaseService: EnhancedFirebaseService;
  private systemPrompt: string;
  private requestCounter: number = 0;
  private totalGptTime: number = 0;
  private totalCommandTime: number = 0;
  private totalRequestTime: number = 0;
  private lastRequestTime: number = 0;
  private debugMode: boolean;

  constructor(config: ChatGPTConfig, firebaseConfig: any, useLocalStorage: boolean = false, debugMode: boolean = false) {
    this.config = config;
    this.debugMode = debugMode;
    
    // Configure logger based on debug mode
    if (debugMode) {
      logger.configure({ logLevel: LogLevel.DEBUG });
    }
    
    // Initialize Firebase service
    this.firebaseService = new EnhancedFirebaseService(firebaseConfig, useLocalStorage, debugMode);
    
    logger.info(LOG_CATEGORY.GPT, 'Initializing ChatGPT Handler', {
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature
    });
    
    // Define the system prompt for GPT that enables "behind the scenes" Firebase commands
    this.systemPrompt = `
 
    Eres un asistente virtual, tu nombre es Kapy. Eres un nuevo trabajador part time para un sistema de beneficios de empresa llamado VMICA.
    
    INSTRUCCIONES CRÍTICAS:
    - Responde de manera conversacional y amigable.
    - NO uses saludos formales como "Hola" o "Saludos" al inicio de cada mensaje (a menos que sea la primera interacción).
    - Mantén tus respuestas concisas y directas.
    - NUNCA menciones Firebase, comandos técnicos, o la estructura interna del sistema en tus respuestas al usuario.
    - Evita términos técnicos como "consulta", "base de datos", "query", etc.
    
    COMPRENSIÓN DE INTENCIONES DEL USUARIO:
    - Analiza PRIMERO qué intenta averiguar el usuario, no solo las palabras exactas que usa.
    - Identifica la INTENCIÓN PRINCIPAL: ¿Busca gastos? ¿Inversión? ¿Estado de beneficios? ¿Estadísticas?
    - Identifica el PERÍODO de tiempo al que se refiere: ¿Un mes específico? ¿El mes actual? ¿Una comparativa?
    
    MAPEO DE INTENCIONES A COMANDOS:
    1. INTENCIÓN: Conocer gastos/costos/dinero gastado
       COMANDO: "firebase:analytics:investment:month=[mes]"
       
    2. INTENCIÓN: Saber inversión/presupuesto/recursos utilizados
       COMANDO: "firebase:analytics:investment:month=[mes]"
       
    3. INTENCIÓN: Ver beneficios utilizados/canjeados/reclamados
       COMANDO: "firebase:analytics:benefit-status:month=[mes]"
       
    4. INTENCIÓN: Comparar rendimiento entre periodos
       COMANDO: "firebase:analytics:compare-december" (si incluye diciembre)
       
    5. INTENCIÓN: Conocer progreso/avance del mes
       COMANDO: "firebase:analytics:month-progress"
       
    6. INTENCIÓN: Saber tasas/porcentajes de utilización
       COMANDO: "firebase:analytics:redemption-rate"
    
    INTERPRETACIÓN CONTEXTUAL DE TIEMPO:
    - "este mes" → mes actual según fecha del sistema
    - "mes pasado" → mes anterior al actual
    - "diciembre" / "dic" / "12" / "último mes del año" → diciembre
    - [cualquier otra referencia a mes] → convertir a nombre completo del mes
    
    ESTRATEGIA DE RESOLUCIÓN DE CONSULTAS:
    1. IDENTIFICA LA INTENCIÓN principal (qué quiere saber)
    2. IDENTIFICA EL PERÍODO de tiempo relevante
    3. SELECCIONA EL COMANDO de analytics más apropiado
    4. Si no hay resultados, USA UN COMANDO ALTERNATIVO
    
    EJEMPLOS DE INTERPRETACIÓN SEMÁNTICA:
    
    "¿Cuánto hemos gastado en diciembre?"
    INTENCIÓN: Conocer gastos
    PERÍODO: Diciembre
    COMANDO: "firebase:analytics:investment:month=diciembre"
    
    "¿Qué tal fue el uso de beneficios el mes pasado?"
    INTENCIÓN: Ver estado de beneficios
    PERÍODO: Mes anterior
    COMANDO: "firebase:analytics:benefit-status:month=[mes anterior]"
    
    "Muéstrame cómo vamos este mes comparado con diciembre"
    INTENCIÓN: Comparar rendimiento
    PERÍODO: Actual vs diciembre
    COMANDO: "firebase:analytics:compare-december"
    
    "¿Cómo va el presupuesto de marzo?"
    INTENCIÓN: Conocer inversión
    PERÍODO: Marzo
    COMANDO: "firebase:analytics:investment:month=marzo"
    
    DETECCIÓN DE SINÓNIMOS Y FRASES RELACIONADAS:
    - Gastos/costos/desembolsos/pagos/dinero usado → intención de conocer gastos
    - Inversión/presupuesto/fondos/recursos → intención de conocer inversión
    - Beneficios usados/canjeados/reclamados/utilizados → intención de ver estado de beneficios
    - Progreso/avance/estado actual/cómo vamos → intención de conocer progreso
    - Comparar/diferencia/contraste/versus → intención de comparar periodos
    
    Tu respuesta debe tener SIEMPRE este formato y NUNCA debe estar vacía:
    
    {
        "userMessage": "Tu respuesta natural para el usuario sin términos técnicos. ESTE CAMPO NUNCA DEBE ESTAR VACÍO.",
        "commands": ["firebase:operacion:coleccion/documento:parametros", "otro:comando"]
    }
    
    REGLAS CRÍTICAS PARA RESPUESTAS:
    1. El campo "userMessage" NUNCA debe estar vacío o ser null.
    2. SIEMPRE debes responder al usuario, incluso si no tienes datos que mostrar.
    3. Si no hay datos disponibles, indícale al usuario que estás buscando la información solicitada.
    4. Si los comandos no devuelven resultados, di algo como "Estoy revisando esa información..." o "Voy a buscar los datos comparativos de diciembre..."
    
    OPERACIONES DISPONIBLES:
    - "firebase:get:nombreColeccion/idDocumento" - Obtener documento específico
    - "firebase:get:nombreColeccion" - Obtener todos los documentos de una colección
    - "firebase:query:nombreColeccion:campo=valor,otrocampo<valor" - Buscar con condiciones
    - "firebase:update:nombreColeccion/idDocumento:campo=valor,campo2=valor2" - Actualizar campos
    - "firebase:set:nombreColeccion/idDocumento:campo=valor,campo2=valor2" - Crear/reemplazar documento
    - "firebase:count:nombreColeccion:campo=valor" - Contar documentos que cumplen condiciones
    
    OPERACIONES DE ANALYTICS DISPONIBLES:
    - "firebase:analytics:month-progress" - Porcentaje de avance del mes actual
    - "firebase:analytics:redemption-rate" - Tasa de canje al día actual o especificado
    - "firebase:analytics:redemption-rate:date=DD/MM/YYYY" - Tasa de canje para una fecha específica
    - "firebase:analytics:historical-rate" - Porcentaje histórico de canje de todos los meses
    - "firebase:analytics:benefit-status" - Quiénes tienen beneficios pendientes y quiénes ya usaron
    - "firebase:analytics:benefit-status:month=mes" - Estado de beneficios filtrado por mes específico
    - "firebase:analytics:active-users" - Total de usuarios activos en el mes actual
    - "firebase:analytics:active-users:month=mes" - Total de usuarios activos en un mes específico
    - "firebase:analytics:investment" - Inversión y devolución en el mes actual
    - "firebase:analytics:investment:month=mes" - Inversión y devolución en un mes específico
    - "firebase:analytics:top-categories" - Top categorías de beneficios
    - "firebase:analytics:compare-december" - Comparación de diciembre con otros meses
    
    COLECCIONES PRINCIPALES:
    - "userBenefits" - Información de beneficios de empleados (Nombre, Beneficio_seleccionado, Categoria, Mes_de_beneficio, estado, etc.)
    - "userSessions" - Sesiones de usuario y conversaciones
    
    IMPORTANTE: El usuario NO VE estos comandos, solo recibe tu mensaje en "userMessage".
    
    EJEMPLOS DE CONSULTAS PROBLEMÁTICAS Y SUS SOLUCIONES (SIEMPRE INCLUIR MENSAJE):
    
    NUNCA DEBES DEJAR EL CAMPO userMessage VACÍO. SIEMPRE RESPONDE ALGO AL USUARIO.
    
    1. Consulta: "dame los gastos de diciembre"
       RAZONAMIENTO: El usuario quiere saber la inversión/gastos en el mes de diciembre
       COMANDO CORRECTO: "firebase:analytics:investment:month=diciembre"
    
    2. Consulta: "cuánto gastamos en diciembre" 
       RAZONAMIENTO: Mismo objetivo que el anterior, distinta forma de preguntar
       COMANDO CORRECTO: "firebase:analytics:investment:month=diciembre"
    
    3. Consulta: "me gustaría ver cuánto se invirtió el último mes del año"
       RAZONAMIENTO: Se refiere a diciembre, busca información de gastos/inversión
       COMANDO CORRECTO: "firebase:analytics:investment:month=diciembre"
    
    4. Consulta: "quiénes ya usaron su beneficio en enero"
       RAZONAMIENTO: Busca estado de beneficios en un mes específico
       COMANDO CORRECTO: "firebase:analytics:benefit-status:month=enero"
    
    5. Consulta: "cuántas personas ya canjearon este mes"
       RAZONAMIENTO: Busca información sobre beneficios canjeados en el mes actual
       COMANDO CORRECTO: "firebase:analytics:benefit-status"
       MENSAJE: "Estoy revisando cuántas personas han canjeado su beneficio este mes, dame un momento..."
    
    6. Consulta: "como crees que le fue a diciembre?"
       RAZONAMIENTO: El usuario quiere comparativas o análisis de rendimiento de diciembre
       COMANDO CORRECTO: "firebase:analytics:compare-december"
       MENSAJE: "Estoy analizando el rendimiento de diciembre en comparación con otros meses, enseguida te muestro la información..."
    
    MECANISMO DE INTERPRETACIÓN EN 4 PASOS:
    1. ANALIZA EL PROPÓSITO: ¿Qué quiere saber realmente el usuario?
    2. IDENTIFICA EL CONTEXTO TEMPORAL: ¿De qué periodo necesita información?
    3. SELECCIONA EL COMANDO MÁS APROPIADO: Usa analytics específicos según el propósito
    4. GENERA SIEMPRE UN MENSAJE DE RESPUESTA: Nunca dejes el campo userMessage vacío
    
    SIEMPRE piensa primero en qué quiere averiguar el usuario (su intención), no solo en las palabras exactas que usa.
    `;
  }












  /**
   * Get performance statistics
   */
  getPerformanceStats(): any {
    return {
      totalRequests: this.requestCounter,
      averageGptTime: this.requestCounter > 0 ? this.totalGptTime / this.requestCounter : 0,
      averageCommandTime: this.requestCounter > 0 ? this.totalCommandTime / this.requestCounter : 0,
      averageTotalTime: this.requestCounter > 0 ? this.totalRequestTime / this.requestCounter : 0,
      lastRequestTime: this.lastRequestTime > 0 ? new Date(this.lastRequestTime).toISOString() : null,
      lastRequestAge: this.lastRequestTime > 0 ? Date.now() - this.lastRequestTime : 0,
      firebaseStats: this.firebaseService.getConnectionStats()
    };
  }

  /**
   * Process a user message through ChatGPT and handle any Firebase commands
   * with comprehensive logging
   */
  async processMessage(message: string, userId: string): Promise<MessageContent> {
    const startTime = Date.now();
    this.lastRequestTime = startTime;
    this.requestCounter++;
    
    logger.info(LOG_CATEGORY.MESSAGE, `Processing message for user ${userId}`, { 
      messageLength: message.length,
      messagePreview: message.substring(0, 50) + (message.length > 50 ? '...' : '')
    });
    
    try {
      // Request to OpenAI
      const gptStartTime = Date.now();
      logger.debug(LOG_CATEGORY.GPT, 'Sending request to ChatGPT API');
      
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.config.model,
          messages: [
            {
              role: "system",
              content: this.systemPrompt
            },
            {
              role: "user",
              content: message
            }
          ],
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        }
      );
    
      const gptEndTime = Date.now();
      const gptDuration = gptEndTime - gptStartTime;
      this.totalGptTime += gptDuration;
      
      logger.info(LOG_CATEGORY.GPT, `ChatGPT response received in ${gptDuration}ms`, {
        tokenUsage: response.data.usage,
        modelUsed: response.data.model
      });

      // Parse the response
      const content = response.data.choices[0].message.content;
      logger.debug(LOG_CATEGORY.GPT, 'Parsing ChatGPT response', {
        responsePreview: content.substring(0, 100) + (content.length > 100 ? '...' : '')
      });
      
      const parsedContent = this.parseGPTResponse(content);
      
      // Check if we have valid commands
      if (parsedContent.commands && parsedContent.commands.length > 0) {
        logger.info(LOG_CATEGORY.COMMANDS, `Extracted ${parsedContent.commands.length} commands from ChatGPT response`, {
          commands: parsedContent.commands
        });
      } else {
        logger.info(LOG_CATEGORY.COMMANDS, 'No commands extracted from ChatGPT response');
      }
      
      const endTime = Date.now();
      const totalDuration = endTime - startTime;
      this.totalRequestTime += totalDuration;
      
      logger.info(LOG_CATEGORY.PERFORMANCE, `Message processing completed in ${totalDuration}ms`, {
        gptTime: gptDuration,
        parsingTime: endTime - gptEndTime,
        requestNumber: this.requestCounter
      });
      
      return parsedContent;
    } catch (error: any) {
      const errorTime = Date.now();
      const duration = errorTime - startTime;
      
      logger.error(LOG_CATEGORY.GPT, `Error processing message with ChatGPT after ${duration}ms`, {
        error: error.message,
        stack: error.stack,
        status: error.response?.status,
        errorData: error.response?.data
      });
      
      // Return appropriate error message
      if (error.response && error.response.status === 401) {
        return {
          userMessage: "Lo siento, pero no puedo procesar tu mensaje en este momento. Por favor, intenta más tarde.",
          commands: []
        };
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return {
          userMessage: "Parece que hay problemas de conexión. ¿Podrías intentarlo nuevamente en unos momentos?",
          commands: []
        };
      }
      
      return {
        userMessage: "Disculpa, tuve un problema al entender tu mensaje. ¿Podrías expresarlo de otra manera?",
        commands: []
      };
    }
  }

  /**
   * Execute Firebase commands and get formatted results for user with timing measurements
   */
  async executeCommandsAndFormat(commands: string[], queryContext: string): Promise<{
    commandResults: any[],
    formattedMessage: string,
    executionTime: number
  }> {
    const startTime = Date.now();
    
    try {
      logger.info(LOG_CATEGORY.COMMANDS, `Executing ${commands.length} Firebase commands`, {
        commands
      });
      
      // Execute commands
      const commandResults = await this.firebaseService.executeCommands(commands);
      
      const executionTime = Date.now() - startTime;
      this.totalCommandTime += executionTime;
      
      logger.info(LOG_CATEGORY.COMMANDS, `Commands executed in ${executionTime}ms with ${commandResults.length} results`);
      
      // Check for errors in results
      const errors = commandResults.filter(result => result.error);
      if (errors.length > 0) {
        logger.warn(LOG_CATEGORY.COMMANDS, `${errors.length} commands returned errors`, {
          errors: errors.map(e => ({ command: e.command, error: e.error }))
        });
      }
      
      // Format results (this would be your existing formatting logic)
      const formattedMessage = this.formatResultsForUser(commandResults, queryContext);
      
      logger.debug(LOG_CATEGORY.COMMANDS, 'Formatted results for user', {
        messageLength: formattedMessage.length,
        messagePreview: formattedMessage.substring(0, 100) + (formattedMessage.length > 100 ? '...' : '')
      });
      
      return {
        commandResults,
        formattedMessage,
        executionTime
      };
    } catch (error: any) {
      const errorTime = Date.now() - startTime;
      logger.error(LOG_CATEGORY.COMMANDS, `Error executing Firebase commands after ${errorTime}ms`, {
        error: error.message,
        stack: error.stack
      });
      
      return {
        commandResults: [],
        formattedMessage: "Lo siento, tuve un problema al buscar esa información. ¿Podrías intentarlo de nuevo?",
        executionTime: errorTime
      };
    }
  }

  /**
   * Process a message, execute any commands, and return a final response
   * This provides a simpler interface for the main bot
   */
  async processMessageWithCommands(message: string, userId: string): Promise<{
    response: string,
    performanceData: any
  }> {
    const startTime = Date.now();
    
    try {
      logger.info(LOG_CATEGORY.MESSAGE, `Processing message with commands for user ${userId}`, {
        messagePreview: message.substring(0, 50) + (message.length > 50 ? '...' : '')
      });
      
      // Get initial response with commands
      const gptStartTime = Date.now();
      const { userMessage, commands } = await this.processMessage(message, userId);
      const gptTime = Date.now() - gptStartTime;
      
      // If there are no commands, just return the user message
      if (!commands || commands.length === 0) {
        const totalTime = Date.now() - startTime;
        
        logger.info(LOG_CATEGORY.PERFORMANCE, `Request completed in ${totalTime}ms (no commands to execute)`, {
          gptTime,
          totalTime
        });
        
        return {
          response: userMessage,
          performanceData: {
            totalTime,
            gptTime,
            commandTime: 0,
            commandCount: 0,
            hasData: false
          }
        };
      }
      
      // Execute commands and get formatted results
      const commandStartTime = Date.now();
      const { formattedMessage, executionTime } = await this.executeCommandsAndFormat(commands, message);
      
      // Combine the GPT response with formatted Firebase results
      let finalResponse = userMessage;
      
      // Only append the Firebase results if they add useful information
      if (formattedMessage && 
          formattedMessage !== "No se encontraron resultados para tu consulta." &&
          formattedMessage.length > 0) {
        finalResponse = `${userMessage}\n\n${formattedMessage}`;
        logger.debug(LOG_CATEGORY.MESSAGE, 'Appended formatted data to response', {
          finalResponseLength: finalResponse.length
        });
      } else {
        logger.debug(LOG_CATEGORY.MESSAGE, 'No formatted data to append, using only GPT response');
      }
      
      const totalTime = Date.now() - startTime;
      
      logger.info(LOG_CATEGORY.PERFORMANCE, `Request completed in ${totalTime}ms`, {
        gptTime,
        commandTime: executionTime,
        commandCount: commands.length,
        totalTime,
        responseLength: finalResponse.length
      });
      
      return {
        response: finalResponse,
        performanceData: {
          totalTime,
          gptTime,
          commandTime: executionTime,
          commandCount: commands.length,
          hasData: formattedMessage.length > 0 && 
                   formattedMessage !== "No se encontraron resultados para tu consulta."
        }
      };
    } catch (error: any) {
      const errorTime = Date.now() - startTime;
      
      logger.error(LOG_CATEGORY.MESSAGE, `Error in processMessageWithCommands after ${errorTime}ms`, {
        error: error.message,
        stack: error.stack
      });
      
      return {
        response: "Lo siento, ocurrió un error al procesar tu mensaje. Por favor, intenta nuevamente.",
        performanceData: {
          totalTime: errorTime,
          error: error.message
        }
      };
    }
  }

  /**
   * Check if the OpenAI API key is valid
   */
  async checkOpenAIApiKey(): Promise<boolean> {
    try {
      logger.info(LOG_CATEGORY.GPT, 'Verifying OpenAI API key');
      
      if (!this.config.apiKey || this.config.apiKey === 'your-openai-api-key') {
        logger.error(LOG_CATEGORY.GPT, 'API key not provided or is using placeholder value');
        return false;
      }

      // Make a small request to verify the API key
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.config.model,
          messages: [
            {
              role: "system",
              content: "Hello"
            },
            {
              role: "user",
              content: "test"
            }
          ],
          max_tokens: 5
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        }
      );
      
      logger.info(LOG_CATEGORY.GPT, 'API key verification successful');
      return true;
    } catch (error: any) {
      logger.error(LOG_CATEGORY.GPT, 'API key verification failed', {
        error: error.message,
        status: error.response?.status,
        errorData: error.response?.data
      });
      return false;
    }
  }

  /**
   * Check if Firebase is connected
   */
  isConnected(): boolean {
    return this.firebaseService.isFirebaseConnected();
  }

  /**
   * Parse GPT response to extract user message and commands
   */
  private parseGPTResponse(content: string): MessageContent {
    try {
      logger.debug(LOG_CATEGORY.GPT, 'Parsing GPT response', {
        contentLength: content.length
      });
      
      // Handle cases where response might not be valid JSON
      if (!content.includes('{') || !content.includes('}')) {
        logger.warn(LOG_CATEGORY.GPT, 'GPT response does not contain JSON', {
          contentPreview: content.substring(0, 100)
        });
        
        return {
          userMessage: content,
          commands: []
        };
      }

      // Extract JSON object from response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn(LOG_CATEGORY.GPT, 'Could not extract JSON from GPT response', {
          contentPreview: content.substring(0, 100)
        });
        
        return {
          userMessage: content,
          commands: []
        };
      }

      const jsonString = jsonMatch[0];
      
      try {
        const parsed = JSON.parse(jsonString);
        
        const result = {
          userMessage: parsed.userMessage || "No pude generar una respuesta clara.",
          commands: Array.isArray(parsed.commands) ? parsed.commands : []
        };
        
        logger.debug(LOG_CATEGORY.GPT, 'Successfully parsed GPT response', {
          userMessageLength: result.userMessage.length,
          commandCount: result.commands.length
        });
        
        return result;
      } catch (jsonError) {
        logger.error(LOG_CATEGORY.GPT, 'Error parsing JSON from GPT response', {
          jsonError,
          jsonPreview: jsonString.substring(0, 100)
        });
        
        return {
          userMessage: content,
          commands: []
        };
      }
    } catch (error: any) {
      logger.error(LOG_CATEGORY.GPT, 'Error in parseGPTResponse', {
        error: error.message,
        stack: error.stack
      });
      
      return {
        userMessage: content,
        commands: []
      };
    }
  }

  /**
   * Format Firebase query results into a human-readable message
   * This would be your existing formatting logic
   */
  private formatResultsForUser(commandResults: any[], queryContext: string = ""): string {
    // Just a placeholder - implement your actual formatting logic here
    if (!commandResults || commandResults.length === 0) {
      return "No se encontraron resultados para tu consulta.";
    }
    
    // Format your results based on command types and results
    // This would be your existing implementation...
    
    // For now, just return a simplified message
    let formattedMessage = "";
    
    // Count successful results
    const successfulResults = commandResults.filter(r => !r.error && r.result);
    
    if (successfulResults.length === 0) {
      return "No se encontraron resultados para tu consulta.";
    }
    
    // Basic formatting for demonstration
    successfulResults.forEach(result => {
      if (Array.isArray(result.result)) {
        formattedMessage += `Se encontraron ${result.result.length} registros.\n\n`;
        
        // If we have benefits data
        if (result.result.length > 0 && (result.result[0].Beneficio_seleccionado || result.result[0].Categoria)) {
          // For benefits data, show summary
          const categories = {};
          const months = {};
          
          result.result.forEach(item => {
            const category = item.Categoria || 'Sin categoría';
            categories[category] = (categories[category] || 0) + 1;
            
            const month = item.Mes_de_beneficio || 'Sin mes';
            months[month] = (months[month] || 0) + 1;
          });
          
          // Show categories
          formattedMessage += "Distribución por categoría:\n";
          Object.entries(categories).forEach(([category, count]) => {
            formattedMessage += `- ${category}: ${count}\n`;
          });
          
          // Show months
          formattedMessage += "\nDistribución por mes:\n";
          Object.entries(months).forEach(([month, count]) => {
            formattedMessage += `- ${month}: ${count}\n`;
          });
        }
      } else if (typeof result.result === 'object' && result.result !== null) {
        formattedMessage += "Información encontrada:\n";
        
        // Format key-value pairs
        Object.entries(result.result).forEach(([key, value]) => {
          if (key !== 'id' && typeof value !== 'object') {
            formattedMessage += `${key}: ${value}\n`;
          }
        });
      }
    });
    
    return formattedMessage;
  }
}

export default EnhancedChatGPTHandler;