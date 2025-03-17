/**
 * ========================================================
 * MULTI-MODEL HANDLER (GEMINI + CHATGPT) PARA WHATSAPP BOT
 * ========================================================
 * 
 * Esta clase implementa una arquitectura de procesamiento en 3 pasos:
 * 1. GEMINI: Comprensión de intención y generación de comandos Firebase
 * 2. FIREBASE: Ejecución de comandos y recuperación de datos
 * 3. CHATGPT: Interpretación avanzada de los datos y generación de respuesta
 */

import axios from 'axios';
import EnhancedFirebaseService from './enhanced-firebase-service';
import DataFormatterService from './data-formatter-service';
import logger, { LogLevel } from '../tools/firebase-logger';

// Constantes para logging
const LOG_CATEGORY = {
  GEMINI: 'Gemini',
  GPT: 'ChatGPT',
  COMMANDS: 'Commands',
  PIPELINE: 'Pipeline',
  PERFORMANCE: 'Performance'
};

interface ModelConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

class MultiModelHandler {
  private geminiConfig: ModelConfig;
  private gptConfig: ModelConfig;
  private firebaseService: EnhancedFirebaseService;
  private dataFormatter: DataFormatterService;
  private geminiPrompt: string;
  private gptPrompt: string;
  private requestCounter: number = 0;
  private totalGeminiTime: number = 0;
  private totalGptTime: number = 0;
  private totalCommandTime: number = 0;
  private totalRequestTime: number = 0;
  private debugMode: boolean;

  constructor(
    geminiConfig: ModelConfig, 
    gptConfig: ModelConfig, 
    firebaseConfig: any, 
    useLocalStorage: boolean = false, 
    debugMode: boolean = false
  ) {
    this.geminiConfig = geminiConfig;
    this.gptConfig = gptConfig;
    this.debugMode = debugMode;
    
    // Configurar logger basado en modo debug
    if (debugMode) {
      logger.configure({ logLevel: LogLevel.DEBUG });
    }
    
    // Inicializar servicios
    this.firebaseService = new EnhancedFirebaseService(firebaseConfig, useLocalStorage, debugMode);
    this.dataFormatter = new DataFormatterService(debugMode);
    
    logger.info(LOG_CATEGORY.PIPELINE, 'Inicializando Multi-Model Handler', {
      geminiModel: geminiConfig.model,
      gptModel: gptConfig.model
    });
    
    // ==== PROMPT PARA GEMINI (PASO 1) ====
    // Optimizado para velocidad y generación precisa de comandos
    this.geminiPrompt = `
    Eres un asistente de IA especializado en análisis de consultas y generación de comandos para Firebase.
    Tu única tarea es analizar la consulta del usuario e identificar qué comandos de Firebase deben ejecutarse.
    
    INSTRUCCIONES CRÍTICAS:
    - NO respondas al usuario - sólo genera los comandos correctos
    - Analiza con precisión la intención del usuario y el contexto temporal
    - Genera comandos Firebase en el formato exacto requerido
    - Si la consulta está incompleta o ambigua, haz tu mejor suposición
    
    COMPRENSIÓN DE INTENCIONES:
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
    
    OPERACIONES DISPONIBLES:
    1. Analytics:
       - "firebase:analytics:month-progress" - Porcentaje de avance del mes actual
       - "firebase:analytics:redemption-rate" - Tasa de canje actual
       - "firebase:analytics:redemption-rate:date=DD/MM/YYYY" - Tasa para fecha específica
       - "firebase:analytics:historical-rate" - Porcentaje histórico de canje
       - "firebase:analytics:benefit-status" - Estado actual de beneficios
       - "firebase:analytics:benefit-status:month=mes" - Estado filtrado por mes
       - "firebase:analytics:active-users" - Usuarios activos en mes actual
       - "firebase:analytics:active-users:month=mes" - Usuarios activos en mes específico
       - "firebase:analytics:investment" - Inversión en mes actual
       - "firebase:analytics:investment:month=mes" - Inversión en mes específico
       - "firebase:analytics:top-categories" - Top categorías de beneficios
       - "firebase:analytics:compare-december" - Comparación con diciembre
    
    2. Operaciones básicas:
       - "firebase:get:coleccion/id" - Obtener documento específico
       - "firebase:get:coleccion" - Obtener todos los documentos
       - "firebase:query:coleccion:campo=valor" - Buscar con condiciones
    
    Tu respuesta debe estar en este formato JSON exacto:
    {
      "intent": "Descripción breve de la intención detectada",
      "temporalContext": "Contexto temporal identificado",
      "commands": ["firebase:comando1", "firebase:comando2"]
    }
    `;
    
    // ==== PROMPT PARA CHATGPT (PASO 3) ====
    // Especializado en interpretación de datos y generación de respuestas
    this.gptPrompt = `
    Eres Kapy, un asistente virtual para un sistema de beneficios de empresa llamado VMICA.
    Tu tarea es interpretar los datos proporcionados y generar una respuesta útil y amigable.
    
    ESTILO DE COMUNICACIÓN:
    - Responde de manera conversacional y amigable
    - Mantén tus respuestas concisas pero informativas
    - NO uses saludos formales como "Hola" o "Saludos" (a menos que sea primera interacción)
    - Explica los datos de forma clara y contextualizada
    - Resume la información más relevante primero, luego agrega detalles
    - No menciones nunca términos técnicos como Firebase, comandos, API, etc.
    
    ESTRUCTURA DE INTERPRETACIÓN:
    1. IDENTIFICA las métricas clave en los datos proporcionados
    2. CONTEXTUALIZA los valores (¿son buenos? ¿malos? ¿mejores que antes?)
    3. DESTACA tendencias o patrones interesantes
    4. FORMULA 1-2 conclusiones útiles basadas en los datos
    
    INFORMACIÓN PROPORCIONADA:
    1. La consulta original del usuario: "{query}"
    2. La intención detectada: "{intent}"
    3. El contexto temporal: "{temporalContext}"
    4. Métricas clave: {keyMetrics}
    5. Tendencias identificadas: {trends}
    6. Datos detallados: {detailedData}
    
    Tu respuesta debe ser natural y directa, enfocándote en responder exactamente lo que el usuario preguntó.
    `;
  }

  /**
   * =============================
   * PIPELINE DE PROCESAMIENTO
   * =============================
   * Implementa el flujo completo de procesamiento:
   * 1. Gemini: Análisis y generación de comandos
   * 2. Firebase: Ejecución de comandos
   * 3. ChatGPT: Interpretación y respuesta
   */
  async processMessage(message: string, userId: string): Promise<string> {
    const startTime = Date.now();
    this.requestCounter++;
    
    logger.info(LOG_CATEGORY.PIPELINE, `Iniciando pipeline de procesamiento para mensaje: "${message.substring(0, 50)}..."`, {
      userId,
      requestNumber: this.requestCounter
    });
    
    try {
      // ===== PASO 1: GEMINI - ANÁLISIS Y GENERACIÓN DE COMANDOS =====
      logger.info(LOG_CATEGORY.PIPELINE, "PASO 1: Enviando consulta a Gemini para análisis");
      const geminiStartTime = Date.now();
      
      const geminiResponse = await this.callGemini(message);
      const geminiEndTime = Date.now();
      const geminiTime = geminiEndTime - geminiStartTime;
      this.totalGeminiTime += geminiTime;
      
      logger.info(LOG_CATEGORY.GEMINI, `Gemini completó análisis en ${geminiTime}ms`, {
        intent: geminiResponse.intent,
        temporalContext: geminiResponse.temporalContext,
        commandCount: geminiResponse.commands.length
      });
      
      // Si no hay comandos, generar respuesta genérica
      if (!geminiResponse.commands || geminiResponse.commands.length === 0) {
        logger.warn(LOG_CATEGORY.PIPELINE, "No se generaron comandos, enviando respuesta genérica");
        return "Lo siento, no pude entender completamente tu consulta. ¿Podrías reformularla o ser más específico?";
      }
      
      // ===== PASO 2: FIREBASE - EJECUCIÓN DE COMANDOS =====
      logger.info(LOG_CATEGORY.PIPELINE, `PASO 2: Ejecutando ${geminiResponse.commands.length} comandos Firebase`);
      const firebaseStartTime = Date.now();
      
      const commandResults = await this.firebaseService.executeCommands(geminiResponse.commands);
      
      const firebaseEndTime = Date.now();
      const firebaseTime = firebaseEndTime - firebaseStartTime;
      this.totalCommandTime += firebaseTime;
      
      logger.info(LOG_CATEGORY.COMMANDS, `Firebase completó ejecución en ${firebaseTime}ms`, {
        resultCount: commandResults.length,
        hasErrors: commandResults.some(r => r.error)
      });
      
      // Si todos los comandos fallaron, generar respuesta de error
      if (commandResults.every(r => r.error)) {
        logger.error(LOG_CATEGORY.PIPELINE, "Todos los comandos fallaron");
        return "Lo siento, tuve problemas al obtener la información solicitada. Por favor, intenta nuevamente en unos momentos.";
      }
      
      // ===== PRE-PROCESAMIENTO: FORMATEAR DATOS PARA INTERPRETACIÓN =====
      const structuredContext = this.dataFormatter.generateStructuredContext(commandResults, message);
      
      // ===== PASO 3: CHATGPT - INTERPRETACIÓN Y RESPUESTA =====
      logger.info(LOG_CATEGORY.PIPELINE, "PASO 3: Enviando resultados a ChatGPT para interpretación");
      const gptStartTime = Date.now();
      
      // Preparar contexto para ChatGPT
      const finalResponse = await this.callChatGPT(
        message,
        geminiResponse.intent,
        geminiResponse.temporalContext,
        structuredContext
      );
      
      const gptEndTime = Date.now();
      const gptTime = gptEndTime - gptStartTime;
      this.totalGptTime += gptTime;
      
      logger.info(LOG_CATEGORY.GPT, `ChatGPT completó interpretación en ${gptTime}ms`, {
        responseLength: finalResponse.length
      });
      
      // ===== COMPLETADO: PIPELINE FINALIZADO =====
      const totalTime = Date.now() - startTime;
      this.totalRequestTime += totalTime;
      
      logger.info(LOG_CATEGORY.PIPELINE, `Pipeline completado en ${totalTime}ms`, {
        geminiTime,
        firebaseTime,
        gptTime,
        totalTime
      });
      
      return finalResponse;
    } catch (error) {
      const errorTime = Date.now() - startTime;
      
      logger.error(LOG_CATEGORY.PIPELINE, `Error en pipeline después de ${errorTime}ms`, {
        error: error.message,
        stack: error.stack
      });
      
      // Mensaje de error genérico para el usuario
      return "Lo siento, ocurrió un error al procesar tu consulta. Por favor, intenta nuevamente.";
    }
  }

  /**
   * Llamada a API de Gemini para análisis de intención y generación de comandos
   */
  private async callGemini(message: string): Promise<{
    intent: string;
    temporalContext: string;
    commands: string[];
  }> {
    try {
      logger.debug(LOG_CATEGORY.GEMINI, `Enviando consulta a Gemini: "${message.substring(0, 50)}..."`);
      
      if (!this.geminiConfig.apiKey) {
        logger.warn(LOG_CATEGORY.GEMINI, "No se configuró clave API de Gemini, usando respuesta simulada");
        
        // Respuesta simulada para pruebas o cuando no hay API key
        return this.simulateGeminiResponse(message);
      }
      
      // Llamada a la API de Gemini (ajustar según la API real)
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiConfig.model}:generateContent`,
        {
          contents: [{
            parts: [{
              text: `${this.geminiPrompt}\n\nConsulta: "${message}"`
            }]
          }],
          generationConfig: {
            maxOutputTokens: this.geminiConfig.maxTokens,
            temperature: this.geminiConfig.temperature
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.geminiConfig.apiKey
          }
        }
      );
      
      // Extraer la respuesta de texto de Gemini (ajustar según formato real)
      const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      
      // Extraer JSON de la respuesta
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No se pudo extraer JSON de la respuesta de Gemini");
      }
      
      const parsedResponse = JSON.parse(jsonMatch[0]);
      
      logger.debug(LOG_CATEGORY.GEMINI, "Respuesta de Gemini procesada", {
        intent: parsedResponse.intent,
        commands: parsedResponse.commands
      });
      
      return {
        intent: parsedResponse.intent || "Intención no identificada",
        temporalContext: parsedResponse.temporalContext || "No especificado",
        commands: Array.isArray(parsedResponse.commands) ? parsedResponse.commands : []
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.GEMINI, `Error en llamada a Gemini: ${error.message}`, { error });
      
      // En caso de error, usar respuesta simulada como fallback
      return this.simulateGeminiResponse(message);
    }
  }

  /**
   * Simula una respuesta de Gemini cuando no está disponible la API
   * o se produce un error en la llamada
   */
  private simulateGeminiResponse(message: string): {
    intent: string;
    temporalContext: string;
    commands: string[];
  } {
    logger.debug(LOG_CATEGORY.GEMINI, "Generando respuesta simulada de Gemini");
    
    // Palabras clave para inferir intención
    const lowerMessage = message.toLowerCase();
    const commands: string[] = [];
    let intent = "Consulta general";
    let temporalContext = "Mes actual";
    
    // Detectar si hay mes específico mencionado
    const months = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    
    // Buscar menciones de meses
    for (const month of months) {
      if (lowerMessage.includes(month)) {
        temporalContext = month;
        break;
      }
    }
    
    // Menciones de tiempo relativo
    if (lowerMessage.includes('mes pasado')) {
      const currentMonth = new Date().getMonth();
      temporalContext = months[currentMonth > 0 ? currentMonth - 1 : 11];
    } else if (lowerMessage.includes('este mes') || lowerMessage.includes('mes actual')) {
      temporalContext = months[new Date().getMonth()];
    }
    
    // Detectar categorías comunes
    const categories = [
      'comidas', 'comida', 'mundo', 'comidas por el mundo', 
      'experiencias', 'bienestar', 'fitness', 'cultura', 'deporte',
      'salud', 'entretenimiento', 'libros', 'tech', 'tecnología'
    ];
    
    let categoryDetected = '';
    
    // Detectar si hay una mención de categoría
    for (const category of categories) {
      if (lowerMessage.includes(category)) {
        categoryDetected = category;
        break;
      }
    }
    
    // Si la categoría es "comidas" o "mundo", es probable que se refiera a "Comidas del Mundo"
    if ((lowerMessage.includes('comidas') && lowerMessage.includes('mundo')) || 
        lowerMessage.includes('comidas por el mundo')) {
      categoryDetected = 'Comidas del Mundo';
    }
    
    // Inferir intención basada en palabras clave y contexto
    if (categoryDetected && temporalContext !== "Mes actual") {
      // Si hay categoría y mes específico
      intent = `Consultar categoría ${categoryDetected} en ${temporalContext}`;
      commands.push(`firebase:query:userBenefits:Categoria=${categoryDetected},Mes_de_beneficio=${temporalContext}`);
    }
    else if (categoryDetected) {
      // Si solo hay categoría
      intent = `Consultar categoría ${categoryDetected}`;
      commands.push(`firebase:query:userBenefits:Categoria=${categoryDetected}`);
    }
    else if (temporalContext !== "Mes actual") {
      // Si solo hay mes específico
      intent = `Consultar datos de ${temporalContext}`;
      commands.push(`firebase:query:userBenefits:Mes_de_beneficio=${temporalContext}`);
    }
    else if (lowerMessage.includes('inversión') || lowerMessage.includes('gasto') || 
        lowerMessage.includes('dinero') || lowerMessage.includes('presupuesto') ||
        lowerMessage.includes('invertido') || lowerMessage.includes('gastado')) {
      intent = "Conocer gastos o inversión";
      commands.push(`firebase:analytics:investment:month=${temporalContext}`);
    }
    else if (lowerMessage.includes('beneficio') || lowerMessage.includes('canje') || 
             lowerMessage.includes('canjeado') || lowerMessage.includes('utilizado') ||
             lowerMessage.includes('uso')) {
      intent = "Ver estado de beneficios";
      commands.push(`firebase:analytics:benefit-status:month=${temporalContext}`);
    }
    else if (lowerMessage.includes('tasa') || lowerMessage.includes('porcentaje') || 
             lowerMessage.includes('redemption') || lowerMessage.includes('canjeo')) {
      intent = "Conocer tasas de utilización";
      commands.push(`firebase:analytics:redemption-rate`);
    }
    else if (lowerMessage.includes('progreso') || lowerMessage.includes('avance') || 
             lowerMessage.includes('actual') || lowerMessage.includes('estado')) {
      intent = "Ver progreso del mes";
      commands.push(`firebase:analytics:month-progress`);
    }
    else if (lowerMessage.includes('comparar') || lowerMessage.includes('compara') || 
             lowerMessage.includes('versus') || lowerMessage.includes('vs') ||
             (lowerMessage.includes('diciembre') && !temporalContext.includes('diciembre'))) {
      intent = "Comparar rendimiento entre periodos";
      commands.push(`firebase:analytics:compare-december`);
    }
    else if (lowerMessage.includes('categoría') || lowerMessage.includes('categoria') || 
             lowerMessage.includes('tipo') || lowerMessage.includes('mejores') ||
             lowerMessage.includes('populares')) {
      intent = "Ver categorías de beneficios";
      commands.push(`firebase:analytics:top-categories`);
    }
    else if (lowerMessage.includes('usuario') || lowerMessage.includes('personas') || 
             lowerMessage.includes('empleados') || lowerMessage.includes('activos')) {
      intent = "Conocer usuarios activos";
      commands.push(`firebase:analytics:active-users:month=${temporalContext}`);
    }
    else {
      // Comando por defecto si no se detecta intención clara
      intent = "Consulta general";
      commands.push(`firebase:analytics:month-progress`);
    }
    
    logger.debug(LOG_CATEGORY.GEMINI, "Respuesta simulada generada", {
      intent,
      temporalContext,
      commands
    });
    
    return { intent, temporalContext, commands };
  }

  /**
   * Llamada a ChatGPT para interpretación de datos y generación de respuesta
   */
  private async callChatGPT(
    query: string, 
    intent: string, 
    temporalContext: string, 
    structuredContext: any
  ): Promise<string> {
    try {
      logger.debug(LOG_CATEGORY.GPT, "Enviando contexto a ChatGPT para interpretación");
      
      // Extraer datos relevantes del contexto estructurado
      const keyMetrics = JSON.stringify(structuredContext.keyMetrics || []);
      const trends = JSON.stringify(structuredContext.trends || []);
      const detailedData = JSON.stringify(structuredContext.summary || {});
      
      // Estructurar el contexto para ChatGPT
      const promptWithContext = this.gptPrompt
        .replace('{query}', query)
        .replace('{intent}', intent)
        .replace('{temporalContext}', temporalContext)
        .replace('{keyMetrics}', keyMetrics)
        .replace('{trends}', trends)
        .replace('{detailedData}', detailedData);
      
      if (!this.gptConfig.apiKey) {
        logger.warn(LOG_CATEGORY.GPT, "No se configuró clave API de ChatGPT, usando respuesta simulada");
        return this.simulateGptResponse(query, intent, structuredContext);
      }
      
      // Llamada a la API de ChatGPT
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.gptConfig.model,
          messages: [
            {
              role: "system",
              content: promptWithContext
            }
          ],
          max_tokens: this.gptConfig.maxTokens,
          temperature: this.gptConfig.temperature
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.gptConfig.apiKey}`
          }
        }
      );
      
      // Extraer respuesta
      const interpretedResponse = response.data.choices[0].message.content;
      
      logger.debug(LOG_CATEGORY.GPT, `Respuesta generada por ChatGPT (${interpretedResponse.length} caracteres)`);
      
      return interpretedResponse;
    } catch (error) {
      logger.error(LOG_CATEGORY.GPT, `Error en llamada a ChatGPT: ${error.message}`, { error });
      
      // En caso de error, generar respuesta simple
      return this.simulateGptResponse(query, intent, structuredContext);
    }
  }

  /**
   * Genera una respuesta simple basada en los datos cuando ChatGPT falla
   */
  private simulateGptResponse(query: string, intent: string, context: any): string {
    logger.debug(LOG_CATEGORY.GPT, "Generando respuesta simulada de ChatGPT");
    
    let response = "He analizado la información solicitada. ";
    
    // Extraer datos clave si están disponibles
    if (context.summary) {
      if (context.summary.investment) {
        const inv = context.summary.investment;
        response += `La inversión total en ${inv.month || 'el período actual'} fue de $${inv.totalInvestment}. `;
        
        if (inv.refundAmount > 0) {
          response += `Se registraron devoluciones por $${inv.refundAmount}, resultando en una inversión neta de $${inv.netInvestment}. `;
        }
      }
      
      if (context.summary.redemption) {
        const red = context.summary.redemption;
        if (red.type === 'specific') {
          response += `La tasa de canje para ${red.month || 'el mes actual'} es de ${red.redemptionRate}%. `;
          
          if (red.totalBenefits > 0) {
            response += `Se han canjeado ${red.totalRedeemed} de un total de ${red.totalBenefits} beneficios. `;
          }
        } else {
          response += `La tasa de canje histórica es de ${red.globalRate}%. `;
        }
      }
      
      if (context.summary.benefitStatus) {
        const ben = context.summary.benefitStatus;
        response += `Actualmente hay ${ben.usersWithPending} usuarios con beneficios pendientes y ${ben.usersWithUsed} con beneficios ya canjeados. `;
      }
      
      if (context.summary.monthProgress) {
        const prog = context.summary.monthProgress;
        response += `El mes actual lleva un progreso del ${prog.progress}% (día ${prog.currentDay} de ${prog.lastDay}). `;
      }
    }
    
    // Agregar conclusión
    if (context.trends && context.trends.length > 0) {
      response += `\n\nUna observación importante: ${context.trends[0]} `;
    }
    
    return response;
  }

  /**
   * Obtener estadísticas de rendimiento
   */
  getPerformanceStats(): any {
    return {
      totalRequests: this.requestCounter,
      averageGeminiTime: this.requestCounter > 0 ? this.totalGeminiTime / this.requestCounter : 0,
      averageGptTime: this.requestCounter > 0 ? this.totalGptTime / this.requestCounter : 0,
      averageCommandTime: this.requestCounter > 0 ? this.totalCommandTime / this.requestCounter : 0,
      averageTotalTime: this.requestCounter > 0 ? this.totalRequestTime / this.requestCounter : 0,
      modelSplit: {
        geminiPercentage: this.totalRequestTime > 0 ? (this.totalGeminiTime / this.totalRequestTime) * 100 : 0,
        firebasePercentage: this.totalRequestTime > 0 ? (this.totalCommandTime / this.totalRequestTime) * 100 : 0,
        gptPercentage: this.totalRequestTime > 0 ? (this.totalGptTime / this.totalRequestTime) * 100 : 0
      },
      firebaseStats: this.firebaseService.getConnectionStats()
    };
  }

  /**
   * Verificar si Firebase está conectado
   */
  isConnected(): boolean {
    return this.firebaseService.isFirebaseConnected();
  }
}

export default MultiModelHandler;